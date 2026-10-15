"""Check Wrangler identities and simulate develop -> master without changing Git state."""

import argparse
import copy
from pathlib import Path
import re
import subprocess
import tempfile
import tomllib


CONFIGS = ("wrangler.toml", "apps/admin/wrangler.toml")


def environment_values(branch):
    staging = branch == "develop"
    api = (
        "https://gnosis-staging.cosmolocal.credit"
        if staging else "https://api.cosmolocal.credit"
    )
    return {
        "VITE_API_URL": api,
        "VITE_BRAND": "staging" if staging else "prod",
        "VITE_PAPER_WALLET_ORIGIN": (
            "https://test.cosmolocal.credit" if staging else "https://app.cosmolocal.credit"
        ),
        "VITE_RELAYER_URL": f"{api}/api/v2/relayer",
        "VITE_RELYING_PARTY_ID": "test.cosmolocal.credit" if staging else "cosmolocal.credit",
        "VITE_STORAGE_URL": (
            "https://gnosis-storage.cosmolocal.credit"
            if staging else "https://storage.cosmolocal.credit"
        ),
    }


def expected_identity(branch, path):
    admin = path == "apps/admin/wrangler.toml"
    name = "clc-admin" if admin else "clc-app"
    if branch == "develop":
        name += "-gnosis"
    values = environment_values(branch)
    if not admin:
        values["VITE_FULL_REACT_ERRORS"] = "true" if branch == "develop" else "false"
    return name, values


def validate_config(text, branch, path):
    config = tomllib.loads(text)
    name, values = expected_identity(branch, path)
    if config.get("name") != name:
        raise ValueError(f"{branch}:{path}: project name must be {name}")
    output = "dist" if path == "apps/admin/wrangler.toml" else "apps/web/dist"
    if config.get("pages_build_output_dir") != output:
        raise ValueError(f"{branch}:{path}: incorrect Pages output directory")
    production = config.get("vars", {})
    preview = config.get("env", {}).get("preview", {}).get("vars", {})
    for label, actual in (("vars", production), ("env.preview.vars", preview)):
        expected = {**values, "VITE_CHAIN_ID": "100"}
        if label == "env.preview.vars":
            expected["VITE_RELYING_PARTY_ID"] = f"{name}.pages.dev"
        for key, value in expected.items():
            if actual.get(key) != value:
                raise ValueError(f"{branch}:{path}: {label}.{key} must be {value!r}")
    if {**production, "VITE_RELYING_PARTY_ID": f"{name}.pages.dev"} != preview:
        raise ValueError(
            f"{branch}:{path}: preview must repeat all vars, with only its relying party changed"
        )
    return config


def shared_text(text, path):
    """Mask only the allowed environment values; retain comments and whitespace."""
    _, values = expected_identity("develop", path)
    section = ""
    result = []
    for line in text.splitlines(keepends=True):
        table = re.fullmatch(r"\s*\[([^\]]+)\]\s*", line)
        if table:
            section = table[1]
        assignment = re.fullmatch(
            r'(\s*(\w+)\s*=\s*)"[^"]*"(.*)', line.rstrip("\n")
        )
        if assignment and (
            (section == "" and assignment[2] == "name")
            or (section in ("vars", "env.preview.vars") and assignment[2] in values)
        ):
            line = f'{assignment[1]}"<environment>"{assignment[3]}' + (
                "\n" if line.endswith("\n") else ""
            )
        result.append(line)
    return "".join(result)


def check_promotion(master_ref, develop_ref, repo):
    def git(*args):
        return subprocess.check_output(
            ["git", *args], cwd=repo, text=True, stderr=subprocess.PIPE
        )

    base = git("merge-base", master_ref, develop_ref).strip()
    for path in CONFIGS:
        master = git("show", f"{master_ref}:{path}")
        develop = git("show", f"{develop_ref}:{path}")
        ancestor = git("show", f"{base}:{path}")
        prod_config = validate_config(master, "master", path)
        staging_config = validate_config(develop, "develop", path)
        with tempfile.TemporaryDirectory(prefix="clc-promotion-") as directory:
            files = [Path(directory) / name for name in ("master", "base", "develop")]
            for file, content in zip(files, (master, ancestor, develop)):
                file.write_text(content)
            merged = subprocess.run(
                ["git", "merge-file", "--stdout", *map(str, files)],
                cwd=repo,
                text=True,
                capture_output=True,
                check=False,
            )
        if merged.returncode:
            raise ValueError(
                f"{path}: develop -> master conflicts. "
                "Keep comments/layout beside environment values identical; resolve on master "
                "with production values, never by merging master into develop."
            )
        result = validate_config(merged.stdout, "master", path)
        expected = copy.deepcopy(staging_config)
        expected["name"] = prod_config["name"]
        _, values = expected_identity("master", path)
        expected["vars"].update(values)
        expected["env"]["preview"]["vars"].update(values)
        expected["env"]["preview"]["vars"]["VITE_RELYING_PARTY_ID"] = (
            f'{prod_config["name"]}.pages.dev'
        )
        if result != expected or shared_text(merged.stdout, path) != shared_text(develop, path):
            raise ValueError(
                f"{path}: shared configuration diverges after promotion; "
                "apply shared changes on develop too"
            )
        print(f"{path}: promotion merges cleanly and preserves production settings")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--master", default="origin/master", help="Production Git ref")
    parser.add_argument("--develop", default="origin/develop", help="Staging Git ref")
    args = parser.parse_args()
    try:
        check_promotion(args.master, args.develop, Path.cwd())
    except (ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Promotion check failed: {error}\n")
