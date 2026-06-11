package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"path/filepath"
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
