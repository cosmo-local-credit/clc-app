package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"slices"
	"testing"
)

func TestRegisterDevicePreservesOmittedMetadata(t *testing.T) {
	t.Parallel()

	testApp := newTestApp(t)
	register := testApp.route(http.MethodPost, testApp.handleRegisterDevice)

	firstRequest := `{
		"deviceId": "device-1",
		"platform": "chrome-android",
		"appVersion": "web-test",
		"serviceWorkerVersion": "worker-v1",
		"permissionState": "granted",
		"vapidKeyVersion": "vapid-v1",
		"currentWalletAddress": "0x1234",
		"pushSubscription": {
			"endpoint": "https://push.example/old",
			"keys": {"auth": "auth-old", "p256dh": "p256dh-old"}
		}
	}`
	requireRegisterStatus(t, register, firstRequest, http.StatusOK)

	refreshRequest := `{
		"deviceId": "device-1",
		"vapidKeyVersion": "vapid-v2",
		"pushSubscription": {
			"endpoint": "https://push.example/new",
			"keys": {"auth": "auth-new", "p256dh": "p256dh-new"}
		}
	}`
	requireRegisterStatus(t, register, refreshRequest, http.StatusOK)

	device := testApp.state.Devices["device-1"]
	if device == nil {
		t.Fatal("registered device is missing")
	}
	if device.Platform != "chrome-android" {
		t.Fatalf("platform was not preserved: %q", device.Platform)
	}
	if device.AppVersion != "web-test" {
		t.Fatalf("app version was not preserved: %q", device.AppVersion)
	}
	if device.ServiceWorkerVersion != "worker-v1" {
		t.Fatalf("service-worker version was not preserved: %q", device.ServiceWorkerVersion)
	}
	if device.PermissionState != "granted" {
		t.Fatalf("permission was not preserved: %q", device.PermissionState)
	}
	if len(device.LinkedWallets) != 1 || device.LinkedWallets[0] != "0x1234" {
		t.Fatalf("linked wallets were not preserved: %#v", device.LinkedWallets)
	}
	if device.VAPIDKeyVersion != "vapid-v2" {
		t.Fatalf("VAPID key version was not refreshed: %q", device.VAPIDKeyVersion)
	}
	if device.PushSubscription == nil || device.PushSubscription.Endpoint != "https://push.example/new" {
		t.Fatalf("push subscription was not refreshed: %#v", device.PushSubscription)
	}
}

func TestDeviceCanLinkMultipleWalletAddresses(t *testing.T) {
	t.Parallel()

	testApp := newTestApp(t)
	linkWallet := testApp.route(http.MethodPost, testApp.handleLinkWallet)

	firstResponse := postJSON[linkWalletResponse](
		t,
		linkWallet,
		"/api/notifications/devices/link-wallet",
		`{"deviceId":"device-1","walletAddress":"0xwallet-a"}`,
	)
	if !slices.Equal(firstResponse.LinkedWallets, []string{"0xwallet-a"}) {
		t.Fatalf("unexpected first wallet link response: %#v", firstResponse.LinkedWallets)
	}

	secondResponse := postJSON[linkWalletResponse](
		t,
		linkWallet,
		"/api/notifications/devices/link-wallet",
		`{"deviceId":"device-1","walletAddress":"0xwallet-b"}`,
	)
	if !slices.Equal(secondResponse.LinkedWallets, []string{"0xwallet-a", "0xwallet-b"}) {
		t.Fatalf("device did not retain both wallet links: %#v", secondResponse.LinkedWallets)
	}

	duplicateResponse := postJSON[linkWalletResponse](
		t,
		linkWallet,
		"/api/notifications/devices/link-wallet",
		`{"deviceId":"device-1","walletAddress":"0xwallet-a"}`,
	)
	if !slices.Equal(duplicateResponse.LinkedWallets, []string{"0xwallet-a", "0xwallet-b"}) {
		t.Fatalf("duplicate wallet link changed canonical links: %#v", duplicateResponse.LinkedWallets)
	}
}

func TestWalletAddressTargetsMultipleActiveDevices(t *testing.T) {
	t.Parallel()

	testApp := newTestApp(t)
	register := testApp.route(http.MethodPost, testApp.handleRegisterDevice)

	registerDeviceForWallet(t, register, "device-1", "0xshared", "https://push.example/device-1")
	registerDeviceForWallet(t, register, "device-2", "0xshared", "https://push.example/device-2")
	registerDeviceForWallet(t, register, "device-3", "0xother", "https://push.example/device-3")

	testApp.mu.Lock()
	recipients := testApp.collectRecipientsLocked("", "0xshared", "")
	testApp.mu.Unlock()

	deviceIDs := make([]string, 0, len(recipients))
	for _, recipient := range recipients {
		deviceIDs = append(deviceIDs, recipient.DeviceID)
	}
	slices.Sort(deviceIDs)

	if !slices.Equal(deviceIDs, []string{"device-1", "device-2"}) {
		t.Fatalf("wallet did not resolve to all and only linked devices: %#v", deviceIDs)
	}
}

func newTestApp(t *testing.T) *app {
	t.Helper()

	return &app{
		allowOrigins:    []string{"*"},
		statePath:       filepath.Join(t.TempDir(), "state.json"),
		vapidKeyVersion: "dev-v1",
		state: devState{
			Devices:      map[string]*device{},
			Messages:     []*inboxMessage{},
			DeliveryAcks: []*deliveryAckRecord{},
			ClickAcks:    []*clickAckRecord{},
		},
	}
}

func registerDeviceForWallet(
	t *testing.T,
	handler http.Handler,
	deviceID string,
	walletAddress string,
	endpoint string,
) {
	t.Helper()

	body, err := json.Marshal(registerDeviceRequest{
		DeviceID:             deviceID,
		CurrentWalletAddress: walletAddress,
		PushSubscription: &pushSubscription{
			Endpoint: endpoint,
			Keys: pushSubscriptionKeys{
				Auth:   "auth-" + deviceID,
				P256dh: "p256dh-" + deviceID,
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal registration request: %v", err)
	}

	requireRegisterStatus(t, handler, string(body), http.StatusOK)
}

func postJSON[T any](
	t *testing.T,
	handler http.Handler,
	path string,
	body string,
) T {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}

	var decoded T
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return decoded
}

func requireRegisterStatus(
	t *testing.T,
	handler http.Handler,
	body string,
	expectedStatus int,
) {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, "/api/notifications/devices/register", bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != expectedStatus {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
}
