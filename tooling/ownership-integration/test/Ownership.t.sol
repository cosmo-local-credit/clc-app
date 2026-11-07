// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface Vm {
    function envString(string calldata) external returns (string memory);
    function getCode(string calldata) external returns (bytes memory);
    function addr(uint256) external returns (address);
    function etch(address, bytes calldata) external;
    function prank(address) external;
    function expectRevert() external;
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function warp(uint256) external;
}

struct Call {
    address to;
    uint256 value;
    bytes data;
}

struct BatchedCall {
    Call[] calls;
    bool revertOnFailure;
}

struct SignedBatchedCall {
    BatchedCall batchedCall;
    uint256 nonce;
    bytes32 keyHash;
    address executor;
    uint256 deadline;
}

interface ICalibur {
    function execute(SignedBatchedCall calldata, bytes calldata) external payable;
    function hashTypedData(bytes32) external view returns (bytes32);
}

interface IOwned {
    function owner() external view returns (address);
    function transferOwnership(address) external;
}

interface IPool {
    function feeAddress() external view returns (address);
    function seal(uint8) external returns (uint8);
}

interface IVoucher {
    function mintTo(address, uint256) external;
    function balanceOf(address) external view returns (uint256);
}

contract FixtureProxy {
    bytes32 constant SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address implementation, bytes memory initialize) {
        assembly { sstore(SLOT, implementation) }
        (bool ok, bytes memory reason) = implementation.delegatecall(initialize);
        if (!ok) assembly { revert(add(reason, 32), mload(reason)) }
    }

    fallback() external payable {
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), sload(SLOT), 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            if iszero(ok) { revert(0, returndatasize()) }
            return(0, returndatasize())
        }
    }
}

// Uses real protocol and Calibur artifacts from the sibling repositories,
// with real proxy initializers and a signed EIP-7702 delegated execution.
contract PoolOwnershipIntegrationTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant KEY = 0xa11ce;
    address sender;
    address recipient = address(0xb0b);
    address feeRecipient = address(0xfee);
    string protocolArtifacts;
    ICalibur wallet;

    function setUp() public {
        protocolArtifacts = vm.envString("CLC_PROTOCOL_ARTIFACTS");
        address implementation =
            deploy(string.concat(vm.envString("CLC_CALIBUR_ARTIFACTS"), "/CaliburEntry.sol/CaliburEntry.json"));
        sender = vm.addr(KEY);
        vm.etch(sender, bytes.concat(hex"ef0100", abi.encodePacked(implementation)));
        wallet = ICalibur(sender);
    }

    function deploy(string memory artifact) internal returns (address deployed) {
        bytes memory code = vm.getCode(artifact);
        assembly { deployed := create(0, add(code, 32), mload(code)) }
        require(deployed != address(0), "artifact deploy failed");
    }

    function proxy(string memory name, bytes memory initialize) internal returns (address) {
        return
            address(
                new FixtureProxy(
                    deploy(string.concat(protocolArtifacts, "/", name, ".sol/", name, ".json")), initialize
                )
            );
    }

    function setupPool(uint256 mode, bool divided) internal returns (address[] memory targets) {
        return setupPoolPaying(mode, divided, feeRecipient);
    }

    function setupPoolPaying(uint256 mode, bool divided, address fees) internal returns (address[] memory targets) {
        address registry = proxy(
            "TokenUniqueSymbolIndex",
            abi.encodeWithSignature(
                "initialize(address,address[],bytes32[])", sender, new address[](0), new bytes32[](0)
            )
        );
        address limiter = proxy("Limiter", abi.encodeWithSignature("initialize(address)", sender));
        address policy = proxy("FeePolicy", abi.encodeWithSignature("initialize(address,uint256)", sender, 10000));
        address quoter;
        if (mode == 0) {
            quoter = deploy(string.concat(protocolArtifacts, "/DecimalQuoter.sol/DecimalQuoter.json"));
        } else if (mode == 1) {
            quoter = proxy("RelativeQuoter", abi.encodeWithSignature("initialize(address)", sender));
        } else {
            quoter =
                proxy("OracleQuoter", abi.encodeWithSignature("initialize(address,address)", sender, address(0xcafe)));
        }
        address pool = proxy(
            "SwapPool",
            abi.encodeWithSignature(
                "initialize(string,string,uint8,address,address,address,address,address,address,bool,address)",
                "Integration",
                "INT",
                uint8(6),
                divided ? address(this) : sender,
                policy,
                fees,
                registry,
                limiter,
                quoter,
                true,
                address(0)
            )
        );
        targets = new address[](mode == 0 ? 4 : 5);
        targets[0] = registry;
        targets[1] = limiter;
        targets[2] = policy;
        if (mode != 0) targets[3] = quoter;
        targets[targets.length - 1] = pool;
    }

    function handover(address[] memory targets) internal view returns (Call[] memory calls) {
        calls = new Call[](targets.length);
        for (uint256 i; i < targets.length; i++) {
            calls[i] = Call(targets[i], 0, abi.encodeCall(IOwned.transferOwnership, (recipient)));
        }
    }

    function signed(address[] memory targets)
        internal
        returns (SignedBatchedCall memory batch, bytes memory signature)
    {
        return signedCalls(handover(targets), 0);
    }

    /// `nonce` is the root key's sequence: its key hash is zero.
    function signedCalls(Call[] memory calls, uint256 nonce)
        internal
        returns (SignedBatchedCall memory batch, bytes memory signature)
    {
        bytes32[] memory hashes = new bytes32[](calls.length);
        for (uint256 i; i < calls.length; i++) {
            hashes[i] = keccak256(
                abi.encode(
                    keccak256("Call(address to,uint256 value,bytes data)"),
                    calls[i].to,
                    calls[i].value,
                    keccak256(calls[i].data)
                )
            );
        }
        batch = SignedBatchedCall(BatchedCall(calls, true), nonce, bytes32(0), address(0), 0);
        bytes32 batchHash = keccak256(
            abi.encode(
                keccak256("BatchedCall(Call[] calls,bool revertOnFailure)Call(address to,uint256 value,bytes data)"),
                keccak256(abi.encodePacked(hashes)),
                true
            )
        );
        bytes32 signedHash = keccak256(
            abi.encode(
                keccak256(
                    "SignedBatchedCall(BatchedCall batchedCall,uint256 nonce,bytes32 keyHash,address executor,uint256 deadline)BatchedCall(Call[] calls,bool revertOnFailure)Call(address to,uint256 value,bytes data)"
                ),
                batchHash,
                nonce,
                bytes32(0),
                address(0),
                0
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, wallet.hashTypedData(signedHash));
        signature = abi.encode(abi.encodePacked(r, s, v), bytes(""));
    }

    function success(uint256 mode) internal {
        address[] memory targets = setupPool(mode, false);
        (SignedBatchedCall memory batch, bytes memory signature) = signed(targets);
        wallet.execute(batch, signature);
        for (uint256 i; i < targets.length; i++) {
            require(IOwned(targets[i]).owner() == recipient, "handover incomplete");
        }
        require(IPool(targets[targets.length - 1]).feeAddress() == feeRecipient, "fee recipient changed");
    }

    function rollback(uint256 mode) internal {
        address[] memory targets = setupPool(mode, true);
        (SignedBatchedCall memory batch, bytes memory signature) = signed(targets);
        vm.expectRevert();
        wallet.execute(batch, signature);
        for (uint256 i; i < targets.length; i++) {
            require(
                IOwned(targets[i]).owner() == (i == targets.length - 1 ? address(this) : sender),
                "partial ownership handover"
            );
        }
    }

    function testDecimalHandover() public {
        success(0);
    }

    function testRelativeHandover() public {
        success(1);
    }

    function testOracleHandover() public {
        success(2);
    }

    function testDecimalFailureRollsBackEveryOwner() public {
        rollback(0);
    }

    function testRelativeFailureRollsBackEveryOwner() public {
        rollback(1);
    }

    function testOracleFailureRollsBackEveryOwner() public {
        rollback(2);
    }

    // Key rotation (GH #412): the old card's wallet hands everything it owns
    // alone to the new card, in the batches planKeyRotationBatches makes.

    function withFeeAddress(address pool, Call[] memory handoverCalls) internal view returns (Call[] memory calls) {
        calls = new Call[](handoverCalls.length + 1);
        calls[0] = Call(pool, 0, abi.encodeWithSignature("setFeeAddress(address)", recipient));
        for (uint256 i; i < handoverCalls.length; i++) {
            calls[i + 1] = handoverCalls[i];
        }
    }

    function testRotationMovesTheCreatorsFeeAddressBeforeTheHandover() public {
        address[] memory targets = setupPoolPaying(1, false, sender);
        address pool = targets[targets.length - 1];
        (SignedBatchedCall memory batch, bytes memory signature) =
            signedCalls(withFeeAddress(pool, handover(targets)), 0);
        wallet.execute(batch, signature);
        for (uint256 i; i < targets.length; i++) {
            require(IOwned(targets[i]).owner() == recipient, "handover incomplete");
        }
        require(IPool(pool).feeAddress() == recipient, "fees still go to the old card");
    }

    function testRotationLeavesASealedFeeAddressAndStillHandsOver() public {
        address[] memory targets = setupPoolPaying(0, false, sender);
        address pool = targets[targets.length - 1];
        vm.prank(sender);
        IPool(pool).seal(2);

        (SignedBatchedCall memory sealedBatch, bytes memory sealedSignature) =
            signedCalls(withFeeAddress(pool, handover(targets)), 0);
        vm.expectRevert();
        wallet.execute(sealedBatch, sealedSignature);

        // The plan leaves setFeeAddress out of a sealed pool's group.
        (SignedBatchedCall memory batch, bytes memory signature) = signed(targets);
        wallet.execute(batch, signature);
        for (uint256 i; i < targets.length; i++) {
            require(IOwned(targets[i]).owner() == recipient, "handover incomplete");
        }
        require(IPool(pool).feeAddress() == sender, "sealed fee address moved");
    }

    function voucher(uint256 expiresAt) internal returns (address token) {
        token = proxy(
            "GiftableToken",
            abi.encodeWithSignature(
                "initialize(string,string,uint8,address,uint256)", "Voucher", "VCH", uint8(6), sender, expiresAt
            )
        );
        vm.prank(sender);
        IVoucher(token).mintTo(sender, 100);
    }

    function testRotationMovesAVoucherThenItsBalance() public {
        address token = voucher(0);
        Call[] memory ownership = new Call[](1);
        ownership[0] = Call(token, 0, abi.encodeCall(IOwned.transferOwnership, (recipient)));
        (SignedBatchedCall memory first, bytes memory firstSignature) = signedCalls(ownership, 0);
        wallet.execute(first, firstSignature);

        Call[] memory transfers = new Call[](1);
        transfers[0] = Call(token, 0, abi.encodeWithSignature("transfer(address,uint256)", recipient, 100));
        (SignedBatchedCall memory second, bytes memory secondSignature) = signedCalls(transfers, 1);
        wallet.execute(second, secondSignature);

        require(IOwned(token).owner() == recipient, "voucher still owned by the old card");
        require(IVoucher(token).balanceOf(recipient) == 100, "balance not moved");
        require(IVoucher(token).balanceOf(sender) == 0, "balance left on the old card");
    }

    function testRotationCannotMoveAnExpiredVoucherBalance() public {
        address token = voucher(block.timestamp + 1 days);
        vm.warp(block.timestamp + 2 days);
        Call[] memory transfers = new Call[](1);
        transfers[0] = Call(token, 0, abi.encodeWithSignature("transfer(address,uint256)", recipient, 100));
        (SignedBatchedCall memory batch, bytes memory signature) = signedCalls(transfers, 0);
        vm.expectRevert();
        wallet.execute(batch, signature);
        require(IVoucher(token).balanceOf(sender) == 100, "expired balance moved");
    }
}
