package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// Dev-only Web Push backend for issue #19.
//
// Run:
//   cd dev/webpush
//   go mod tidy
//   go run .
//
// Useful endpoints:
//   GET  /healthz
//   GET  /api/notifications/vapid-public-key
//   POST /api/notifications/devices/register
//   POST /api/notifications/devices/link-wallet
//   POST /api/notifications/devices/unlink-wallet
//   POST /api/notifications/devices/disable
//   POST /api/notifications/acks/delivery
//   POST /api/notifications/acks/click
//   POST /api/notifications/inbox/sync
//   GET  /debug/state
//   POST /debug/send
//
// Example send payload:
//   {
//     "walletAddress": "0xabc...",
//     "notification": {
//       "kind": "voucher.received",
//       "title": "Voucher received",
//       "body": "You received a voucher.",
//       "targetUrl": "/wallet"
//     }
//   }

const (
	defaultAddr         = ":8787"
	defaultSubscriber   = "dev@clc.local"
	defaultKeyVersion   = "dev-v1"
	defaultDataDir      = "data"
	defaultTargetURL    = "/"
	defaultNotification = "You have a new CLC notification."
)

var supportedKinds = map[string]struct{}{
	"voucher.received":  {},
	"swap.completed":    {},
	"offramp.completed": {},
}

var defaultPrioritiesByKind = map[string]string{
	"voucher.received":  "high",
	"swap.completed":    "normal",
	"offramp.completed": "high",
}

var supportedPriorities = map[string]struct{}{
	"very-low": {},
	"low":      {},
	"normal":   {},
	"high":     {},
}

type app struct {
	mu              sync.Mutex
	dataDir         string
	statePath       string
	keysPath        string
	allowOrigins    []string
	vapidSubscriber string
	vapidKeyVersion string
	keys            vapidKeys
	state           devState
}

type vapidKeys struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

type devState struct {
	Revision     int64                `json:"revision"`
	Devices      map[string]*device   `json:"devices"`
	Messages     []*inboxMessage      `json:"messages"`
	DeliveryAcks []*deliveryAckRecord `json:"deliveryAcks"`
	ClickAcks    []*clickAckRecord    `json:"clickAcks"`
}

type device struct {
	DeviceID             string            `json:"deviceId"`
	Platform             string            `json:"platform,omitempty"`
	AppVersion           string            `json:"appVersion,omitempty"`
	ServiceWorkerVersion string            `json:"serviceWorkerVersion,omitempty"`
	PermissionState      string            `json:"permissionState,omitempty"`
	PushSubscription     *pushSubscription `json:"pushSubscription,omitempty"`
	VAPIDKeyVersion      string            `json:"vapidKeyVersion,omitempty"`
	LinkedWallets        []string          `json:"linkedWalletAddresses"`
	SubscriptionStatus   string            `json:"subscriptionStatus"`
	LastSeenAt           string            `json:"lastSeenAt,omitempty"`
	LastRegisteredAt     string            `json:"lastRegisteredAt,omitempty"`
	LastSendStatusCode   int               `json:"lastSendStatusCode,omitempty"`
	LastSendError        string            `json:"lastSendError,omitempty"`
}

type pushSubscription struct {
	Endpoint       string               `json:"endpoint"`
	ExpirationTime *int64               `json:"expirationTime,omitempty"`
	Keys           pushSubscriptionKeys `json:"keys"`
}

type pushSubscriptionKeys struct {
	Auth   string `json:"auth"`
	P256dh string `json:"p256dh"`
}

type notificationPayload struct {
	NotificationID      string               `json:"notificationId"`
	Kind                string               `json:"kind"`
	Title               string               `json:"title"`
	Body                string               `json:"body"`
	TargetURL           string               `json:"targetUrl"`
	WalletAddressTarget string               `json:"walletAddressTarget,omitempty"`
	Priority            string               `json:"priority"`
	CreatedAt           string               `json:"createdAt"`
	ExpiresAt           string               `json:"expiresAt,omitempty"`
	Actions             []notificationAction `json:"actions,omitempty"`
	VoucherID           string               `json:"voucherId,omitempty"`
	SwapID              string               `json:"swapId,omitempty"`
	OffRampReference    string               `json:"offRampReference,omitempty"`
}

type notificationAction struct {
	Action string `json:"action"`
	Title  string `json:"title"`
}

type inboxMessage struct {
	RecordID   string `json:"recordId"`
	Revision   int64  `json:"revision"`
	DeviceID   string `json:"deviceId"`
	SentAt     string `json:"sentAt"`
	ReceivedAt string `json:"receivedAt,omitempty"`
	ShownAt    string `json:"shownAt,omitempty"`
	ClickedAt  string `json:"clickedAt,omitempty"`
	ActionID   string `json:"actionId,omitempty"`
	PushStatus string `json:"pushStatus"`
	PushCode   int    `json:"pushStatusCode,omitempty"`
	PushError  string `json:"pushError,omitempty"`
	notificationPayload
}

type registerDeviceRequest struct {
	DeviceID             string            `json:"deviceId"`
	Platform             *string           `json:"platform,omitempty"`
	AppVersion           *string           `json:"appVersion,omitempty"`
	ServiceWorkerVersion *string           `json:"serviceWorkerVersion,omitempty"`
	PermissionState      *string           `json:"permissionState,omitempty"`
	PushSubscription     *pushSubscription `json:"pushSubscription,omitempty"`
	VAPIDKeyVersion      *string           `json:"vapidKeyVersion,omitempty"`
	CurrentWalletAddress string            `json:"currentWalletAddress,omitempty"`
	LinkedWallets        []string          `json:"linkedWalletAddresses,omitempty"`
}

type registerDeviceResponse struct {
	DeviceID               string               `json:"deviceId"`
	Status                 string               `json:"status"`
	CanonicalLinkedWallets []string             `json:"canonicalLinkedWalletAddresses"`
	NotificationSettings   notificationSettings `json:"notificationSettings"`
	InboxSyncCursor        string               `json:"inboxSyncCursor"`
	SubscriptionStatus     string               `json:"subscriptionStatus"`
}

type notificationSettings struct {
	Enabled bool `json:"enabled"`
}

type linkWalletRequest struct {
	DeviceID      string `json:"deviceId"`
	WalletAddress string `json:"walletAddress"`
}

type linkWalletResponse struct {
	LinkedWallets []string `json:"linkedWalletAddresses"`
}

type disableDeviceRequest struct {
	DeviceID             string `json:"deviceId"`
	SubscriptionEndpoint string `json:"subscriptionEndpoint,omitempty"`
}

type disableDeviceResponse struct {
	DeviceID           string `json:"deviceId"`
	SubscriptionStatus string `json:"subscriptionStatus"`
}

type deliveryAckRequest struct {
	NotificationID       string `json:"notificationId"`
	DeviceID             string `json:"deviceId"`
	WalletAddressTarget  string `json:"walletAddressTarget,omitempty"`
	ReceivedAt           string `json:"receivedAt,omitempty"`
	ShownAt              string `json:"shownAt,omitempty"`
	ServiceWorkerVersion string `json:"serviceWorkerVersion,omitempty"`
	Platform             string `json:"platform,omitempty"`
}

type deliveryAckRecord struct {
	Revision             int64  `json:"revision"`
	NotificationID       string `json:"notificationId"`
	DeviceID             string `json:"deviceId"`
	WalletAddressTarget  string `json:"walletAddressTarget,omitempty"`
	ReceivedAt           string `json:"receivedAt"`
	ShownAt              string `json:"shownAt,omitempty"`
	ServiceWorkerVersion string `json:"serviceWorkerVersion,omitempty"`
	Platform             string `json:"platform,omitempty"`
}

type clickAckRequest struct {
	NotificationID string `json:"notificationId"`
	DeviceID       string `json:"deviceId"`
	ActionID       string `json:"actionId,omitempty"`
	TargetURL      string `json:"targetUrl,omitempty"`
	Timestamp      string `json:"timestamp,omitempty"`
}

type clickAckRecord struct {
	Revision       int64  `json:"revision"`
	NotificationID string `json:"notificationId"`
	DeviceID       string `json:"deviceId"`
	ActionID       string `json:"actionId,omitempty"`
	TargetURL      string `json:"targetUrl,omitempty"`
	Timestamp      string `json:"timestamp"`
}

type inboxSyncRequest struct {
	DeviceID       string   `json:"deviceId"`
	LinkedWallets  []string `json:"linkedWalletAddresses,omitempty"`
	LastSyncCursor string   `json:"lastSyncCursor,omitempty"`
}

type inboxSyncResponse struct {
	Messages       []*inboxMessage `json:"messages"`
	DeletedIDs     []string        `json:"deletedIds"`
	NextSyncCursor string          `json:"nextSyncCursor"`
}

type debugSendRequest struct {
	DeviceID      string              `json:"deviceId,omitempty"`
	WalletAddress string              `json:"walletAddress,omitempty"`
	Notification  notificationPayload `json:"notification"`
}

type debugSendResponse struct {
	NotificationID string            `json:"notificationId"`
	Recipients     []debugSendResult `json:"recipients"`
}

type debugSendResult struct {
	DeviceID   string `json:"deviceId"`
	Status     string `json:"status"`
	StatusCode int    `json:"statusCode,omitempty"`
	Error      string `json:"error,omitempty"`
}

type debugStateResponse struct {
	VAPIDPublicKey string   `json:"vapidPublicKey"`
	KeyVersion     string   `json:"keyVersion"`
	AllowOrigins   []string `json:"allowOrigins"`
	State          devState `json:"state"`
}

type apiError struct {
	Status  int
	Message string
}

func (e *apiError) Error() string {
	return e.Message
}

func main() {
	app, err := newApp()
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", app.route(http.MethodGet, app.handleHealth))
	mux.HandleFunc("/api/notifications/vapid-public-key", app.route(http.MethodGet, app.handleVAPIDPublicKey))
	mux.HandleFunc("/api/notifications/devices/register", app.route(http.MethodPost, app.handleRegisterDevice))
	mux.HandleFunc("/api/notifications/devices/link-wallet", app.route(http.MethodPost, app.handleLinkWallet))
	mux.HandleFunc("/api/notifications/devices/unlink-wallet", app.route(http.MethodPost, app.handleUnlinkWallet))
	mux.HandleFunc("/api/notifications/devices/disable", app.route(http.MethodPost, app.handleDisableDevice))
	mux.HandleFunc("/api/notifications/acks/delivery", app.route(http.MethodPost, app.handleDeliveryAck))
	mux.HandleFunc("/api/notifications/acks/click", app.route(http.MethodPost, app.handleClickAck))
	mux.HandleFunc("/api/notifications/inbox/sync", app.route(http.MethodPost, app.handleInboxSync))
	mux.HandleFunc("/debug/state", app.route(http.MethodGet, app.handleDebugState))
	mux.HandleFunc("/debug/send", app.route(http.MethodPost, app.handleDebugSend))

	addr := envOr("WEBPUSH_ADDR", defaultAddr)
	log.Printf("[webpush] listening on %s", addr)
	log.Printf("[webpush] data dir: %s", app.dataDir)
	log.Printf("[webpush] public key endpoint: http://localhost%s/api/notifications/vapid-public-key", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func newApp() (*app, error) {
	dataDir := envOr("WEBPUSH_DATA_DIR", defaultDataDir)
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	keysPath := filepath.Join(dataDir, "vapid_keys.json")
	keys, err := loadOrCreateVAPIDKeys(keysPath)
	if err != nil {
		return nil, err
	}

	statePath := filepath.Join(dataDir, "state.json")
	state, err := loadState(statePath)
	if err != nil {
		return nil, err
	}

	return &app{
		dataDir:         dataDir,
		statePath:       statePath,
		keysPath:        keysPath,
		allowOrigins:    parseCSV(envOr("WEBPUSH_ALLOW_ORIGINS", "*")),
		vapidSubscriber: envOr("WEBPUSH_SUBSCRIBER", defaultSubscriber),
		vapidKeyVersion: envOr("WEBPUSH_KEY_VERSION", defaultKeyVersion),
		keys:            keys,
		state:           state,
	}, nil
}

func loadOrCreateVAPIDKeys(path string) (vapidKeys, error) {
	var keys vapidKeys
	if _, err := os.Stat(path); err == nil {
		if err := readJSONFile(path, &keys); err != nil {
			return vapidKeys{}, fmt.Errorf("read vapid keys: %w", err)
		}
		if keys.PublicKey == "" || keys.PrivateKey == "" {
			return vapidKeys{}, fmt.Errorf("vapid keys file is incomplete: %s", path)
		}
		return keys, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return vapidKeys{}, fmt.Errorf("stat vapid keys: %w", err)
	}

	privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return vapidKeys{}, fmt.Errorf("generate vapid keys: %w", err)
	}

	keys = vapidKeys{PublicKey: publicKey, PrivateKey: privateKey}
	if err := writeJSONFile(path, keys); err != nil {
		return vapidKeys{}, fmt.Errorf("write vapid keys: %w", err)
	}
	return keys, nil
}

func loadState(path string) (devState, error) {
	state := devState{
		Devices:      map[string]*device{},
		Messages:     []*inboxMessage{},
		DeliveryAcks: []*deliveryAckRecord{},
		ClickAcks:    []*clickAckRecord{},
	}

	if _, err := os.Stat(path); err == nil {
		if err := readJSONFile(path, &state); err != nil {
			return devState{}, fmt.Errorf("read state: %w", err)
		}
		if state.Devices == nil {
			state.Devices = map[string]*device{}
		}
		if state.Messages == nil {
			state.Messages = []*inboxMessage{}
		}
		if state.DeliveryAcks == nil {
			state.DeliveryAcks = []*deliveryAckRecord{}
		}
		if state.ClickAcks == nil {
			state.ClickAcks = []*clickAckRecord{}
		}
		return state, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return devState{}, fmt.Errorf("stat state: %w", err)
	}

	if err := writeJSONFile(path, state); err != nil {
		return devState{}, fmt.Errorf("write initial state: %w", err)
	}
	return state, nil
}

func (a *app) route(method string, handler func(http.ResponseWriter, *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a.applyCORS(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != method {
			writeError(w, &apiError{Status: http.StatusMethodNotAllowed, Message: "method not allowed"})
			return
		}
		if err := handler(w, r); err != nil {
			writeError(w, err)
		}
	}
}

func (a *app) applyCORS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if len(a.allowOrigins) == 1 && a.allowOrigins[0] == "*" {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	} else if origin != "" && slices.Contains(a.allowOrigins, origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
}

func (a *app) handleHealth(w http.ResponseWriter, _ *http.Request) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	response := map[string]any{
		"ok":           true,
		"keyVersion":   a.vapidKeyVersion,
		"deviceCount":  len(a.state.Devices),
		"messageCount": len(a.state.Messages),
	}
	return writeJSON(w, http.StatusOK, response)
}

func (a *app) handleVAPIDPublicKey(w http.ResponseWriter, _ *http.Request) error {
	response := map[string]string{
		"publicKey":  a.keys.PublicKey,
		"keyVersion": a.vapidKeyVersion,
	}
	return writeJSON(w, http.StatusOK, response)
}

func (a *app) handleRegisterDevice(w http.ResponseWriter, r *http.Request) error {
	var req registerDeviceRequest
	if err := readJSONBody(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.DeviceID) == "" {
		return &apiError{Status: http.StatusBadRequest, Message: "deviceId is required"}
	}
	if req.PushSubscription != nil {
		if err := validateSubscription(*req.PushSubscription); err != nil {
			return err
		}
	}

	now := nowRFC3339()

	a.mu.Lock()
	defer a.mu.Unlock()

	d := a.ensureDeviceLocked(req.DeviceID)
	if req.Platform != nil {
		d.Platform = strings.TrimSpace(*req.Platform)
	}
	if req.AppVersion != nil {
		d.AppVersion = strings.TrimSpace(*req.AppVersion)
	}
	if req.ServiceWorkerVersion != nil {
		d.ServiceWorkerVersion = strings.TrimSpace(*req.ServiceWorkerVersion)
	}
	if req.PermissionState != nil {
		d.PermissionState = strings.TrimSpace(*req.PermissionState)
	}
	if req.VAPIDKeyVersion != nil {
		d.VAPIDKeyVersion = firstNonEmpty(strings.TrimSpace(*req.VAPIDKeyVersion), a.vapidKeyVersion)
	} else if d.VAPIDKeyVersion == "" {
		d.VAPIDKeyVersion = a.vapidKeyVersion
	}
	d.LastSeenAt = now
	d.LastRegisteredAt = now

	wallets := append([]string{}, req.LinkedWallets...)
	if req.CurrentWalletAddress != "" {
		wallets = append(wallets, req.CurrentWalletAddress)
	}
	d.LinkedWallets = mergeUniqueStrings(d.LinkedWallets, wallets)

	if req.PushSubscription != nil {
		subscriptionCopy := *req.PushSubscription
		d.PushSubscription = &subscriptionCopy
		d.SubscriptionStatus = "active"
	} else if d.SubscriptionStatus == "" {
		d.SubscriptionStatus = "missing-subscription"
	}

	if err := a.saveStateLocked(); err != nil {
		return err
	}

	response := registerDeviceResponse{
		DeviceID:               d.DeviceID,
		Status:                 "ok",
		CanonicalLinkedWallets: append([]string{}, d.LinkedWallets...),
		NotificationSettings:   notificationSettings{Enabled: d.SubscriptionStatus == "active"},
		InboxSyncCursor:        fmt.Sprintf("%d", a.state.Revision),
		SubscriptionStatus:     d.SubscriptionStatus,
	}
	return writeJSON(w, http.StatusOK, response)
}

func (a *app) handleLinkWallet(w http.ResponseWriter, r *http.Request) error {
	var req linkWalletRequest
	if err := readJSONBody(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.DeviceID) == "" || strings.TrimSpace(req.WalletAddress) == "" {
		return &apiError{Status: http.StatusBadRequest, Message: "deviceId and walletAddress are required"}
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	d := a.ensureDeviceLocked(req.DeviceID)
	d.LinkedWallets = mergeUniqueStrings(d.LinkedWallets, []string{req.WalletAddress})
	d.LastSeenAt = nowRFC3339()
	if d.SubscriptionStatus == "" {
		d.SubscriptionStatus = "missing-subscription"
	}

	if err := a.saveStateLocked(); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, linkWalletResponse{LinkedWallets: append([]string{}, d.LinkedWallets...)})
}

func (a *app) handleUnlinkWallet(w http.ResponseWriter, r *http.Request) error {
	var req linkWalletRequest
	if err := readJSONBody(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.DeviceID) == "" || strings.TrimSpace(req.WalletAddress) == "" {
		return &apiError{Status: http.StatusBadRequest, Message: "deviceId and walletAddress are required"}
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	d, ok := a.state.Devices[req.DeviceID]
	if !ok {
		return &apiError{Status: http.StatusNotFound, Message: "device not found"}
	}
	d.LinkedWallets = removeString(d.LinkedWallets, req.WalletAddress)
	d.LastSeenAt = nowRFC3339()

	if err := a.saveStateLocked(); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, linkWalletResponse{LinkedWallets: append([]string{}, d.LinkedWallets...)})
}

func (a *app) handleDisableDevice(w http.ResponseWriter, r *http.Request) error {
	var req disableDeviceRequest
	if err := readJSONBody(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.DeviceID) == "" {
		return &apiError{Status: http.StatusBadRequest, Message: "deviceId is required"}
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	d, ok := a.state.Devices[req.DeviceID]
	if !ok {
		return &apiError{Status: http.StatusNotFound, Message: "device not found"}
	}
	if req.SubscriptionEndpoint != "" && d.PushSubscription != nil && d.PushSubscription.Endpoint != req.SubscriptionEndpoint {
		return &apiError{Status: http.StatusConflict, Message: "subscription endpoint does not match the current device subscription"}
	}

	d.SubscriptionStatus = "disabled"
	d.LastSeenAt = nowRFC3339()

	if err := a.saveStateLocked(); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, disableDeviceResponse{DeviceID: d.DeviceID, SubscriptionStatus: d.SubscriptionStatus})
}

func (a *app) handleDeliveryAck(w http.ResponseWriter, r *http.Request) error {
	var req deliveryAckRequest
	if err := readJSONBody(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.NotificationID) == "" || strings.TrimSpace(req.DeviceID) == "" {
		return &apiError{Status: http.StatusBadRequest, Message: "notificationId and deviceId are required"}
	}

	receivedAt := firstNonEmpty(strings.TrimSpace(req.ReceivedAt), nowRFC3339())
	shownAt := strings.TrimSpace(req.ShownAt)

	a.mu.Lock()
	defer a.mu.Unlock()

	revision := a.bumpRevisionLocked()
	record := &deliveryAckRecord{
		Revision:             revision,
		NotificationID:       req.NotificationID,
		DeviceID:             req.DeviceID,
		WalletAddressTarget:  strings.TrimSpace(req.WalletAddressTarget),
		ReceivedAt:           receivedAt,
		ShownAt:              shownAt,
		ServiceWorkerVersion: strings.TrimSpace(req.ServiceWorkerVersion),
		Platform:             strings.TrimSpace(req.Platform),
	}
	a.state.DeliveryAcks = append(a.state.DeliveryAcks, record)
	if msg := a.findMessageLocked(req.DeviceID, req.NotificationID); msg != nil {
		msg.Revision = revision
		msg.ReceivedAt = receivedAt
		if shownAt != "" {
			msg.ShownAt = shownAt
		}
	}

	if err := a.saveStateLocked(); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, map[string]bool{"accepted": true})
}

func (a *app) handleClickAck(w http.ResponseWriter, r *http.Request) error {
	var req clickAckRequest
	if err := readJSONBody(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.NotificationID) == "" || strings.TrimSpace(req.DeviceID) == "" {
		return &apiError{Status: http.StatusBadRequest, Message: "notificationId and deviceId are required"}
	}

	timestamp := firstNonEmpty(strings.TrimSpace(req.Timestamp), nowRFC3339())

	a.mu.Lock()
	defer a.mu.Unlock()

	revision := a.bumpRevisionLocked()
	record := &clickAckRecord{
		Revision:       revision,
		NotificationID: req.NotificationID,
		DeviceID:       req.DeviceID,
		ActionID:       strings.TrimSpace(req.ActionID),
		TargetURL:      strings.TrimSpace(req.TargetURL),
		Timestamp:      timestamp,
	}
	a.state.ClickAcks = append(a.state.ClickAcks, record)
	if msg := a.findMessageLocked(req.DeviceID, req.NotificationID); msg != nil {
		msg.Revision = revision
		msg.ClickedAt = timestamp
		msg.ActionID = strings.TrimSpace(req.ActionID)
	}

	if err := a.saveStateLocked(); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, map[string]bool{"accepted": true})
}

func (a *app) handleInboxSync(w http.ResponseWriter, r *http.Request) error {
	var req inboxSyncRequest
	if err := readJSONBody(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.DeviceID) == "" {
		return &apiError{Status: http.StatusBadRequest, Message: "deviceId is required"}
	}

	lastRevision, err := parseCursor(req.LastSyncCursor)
	if err != nil {
		return &apiError{Status: http.StatusBadRequest, Message: "lastSyncCursor must be an integer string"}
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	messages := make([]*inboxMessage, 0)
	for _, msg := range a.state.Messages {
		if msg.DeviceID != req.DeviceID {
			continue
		}
		if msg.Revision <= lastRevision {
			continue
		}
		if len(req.LinkedWallets) > 0 && msg.WalletAddressTarget != "" && !slices.Contains(req.LinkedWallets, msg.WalletAddressTarget) {
			continue
		}
		copied := *msg
		messages = append(messages, &copied)
	}

	response := inboxSyncResponse{
		Messages:       messages,
		DeletedIDs:     []string{},
		NextSyncCursor: fmt.Sprintf("%d", a.state.Revision),
	}
	return writeJSON(w, http.StatusOK, response)
}

func (a *app) handleDebugState(w http.ResponseWriter, _ *http.Request) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	response := debugStateResponse{
		VAPIDPublicKey: a.keys.PublicKey,
		KeyVersion:     a.vapidKeyVersion,
		AllowOrigins:   append([]string{}, a.allowOrigins...),
		State:          a.state,
	}
	return writeJSON(w, http.StatusOK, response)
}

func (a *app) handleDebugSend(w http.ResponseWriter, r *http.Request) error {
	var req debugSendRequest
	if err := readJSONBody(r, &req); err != nil {
		return err
	}

	payload, err := normalizeNotification(req)
	if err != nil {
		return err
	}

	a.mu.Lock()
	recipients := a.collectRecipientsLocked(req.DeviceID, req.WalletAddress, payload.WalletAddressTarget)
	a.mu.Unlock()

	if len(recipients) == 0 {
		return &apiError{Status: http.StatusNotFound, Message: "no active subscribed devices matched the request"}
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	results := make([]debugSendResult, 0, len(recipients))
	for _, recipient := range recipients {
		status, code, sendErr := a.sendPush(recipient, payloadBytes, payload.Priority)
		results = append(results, debugSendResult{
			DeviceID:   recipient.DeviceID,
			Status:     status,
			StatusCode: code,
			Error:      sendErr,
		})
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	for _, result := range results {
		a.recordSendResultLocked(result, payload)
	}
	if err := a.saveStateLocked(); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, debugSendResponse{NotificationID: payload.NotificationID, Recipients: results})
}

func (a *app) sendPush(recipient device, payload []byte, priority string) (string, int, string) {
	subscription := webpush.Subscription{
		Endpoint: recipient.PushSubscription.Endpoint,
		Keys: webpush.Keys{
			Auth:   recipient.PushSubscription.Keys.Auth,
			P256dh: recipient.PushSubscription.Keys.P256dh,
		},
	}

	response, err := webpush.SendNotification(payload, &subscription, &webpush.Options{
		AuthScheme:      authSchemeForEndpoint(subscription.Endpoint),
		Subscriber:      a.vapidSubscriber,
		TTL:             60,
		Urgency:         urgencyForPriority(priority),
		VAPIDPublicKey:  a.keys.PublicKey,
		VAPIDPrivateKey: a.keys.PrivateKey,
	})
	if err != nil {
		return "send-error", 0, err.Error()
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusGone {
		return "stale-subscription", response.StatusCode, response.Status
	}
	if response.StatusCode >= 400 {
		return "push-service-error", response.StatusCode, response.Status
	}
	return "sent", response.StatusCode, ""
}

func (a *app) recordSendResultLocked(result debugSendResult, payload notificationPayload) {
	d, ok := a.state.Devices[result.DeviceID]
	if ok {
		d.LastSendStatusCode = result.StatusCode
		d.LastSendError = result.Error
		d.LastSeenAt = nowRFC3339()
		switch result.Status {
		case "sent":
			d.SubscriptionStatus = "active"
		case "stale-subscription":
			d.SubscriptionStatus = "stale"
		}
	}

	revision := a.bumpRevisionLocked()
	message := a.findMessageLocked(result.DeviceID, payload.NotificationID)
	if message == nil {
		message = &inboxMessage{
			RecordID:            fmt.Sprintf("%s::%s", result.DeviceID, payload.NotificationID),
			DeviceID:            result.DeviceID,
			SentAt:              nowRFC3339(),
			notificationPayload: payload,
		}
		a.state.Messages = append(a.state.Messages, message)
	}
	message.Revision = revision
	message.PushStatus = result.Status
	message.PushCode = result.StatusCode
	message.PushError = result.Error
}

func (a *app) ensureDeviceLocked(deviceID string) *device {
	d, ok := a.state.Devices[deviceID]
	if ok {
		return d
	}
	d = &device{DeviceID: deviceID, LinkedWallets: []string{}, SubscriptionStatus: "missing-subscription"}
	a.state.Devices[deviceID] = d
	return d
}

func (a *app) collectRecipientsLocked(deviceID, walletAddress, walletAddressTarget string) []device {
	targetDeviceID := strings.TrimSpace(deviceID)
	targetWallet := firstNonEmpty(strings.TrimSpace(walletAddress), strings.TrimSpace(walletAddressTarget))
	recipients := make([]device, 0)

	for _, d := range a.state.Devices {
		if d.PushSubscription == nil || d.SubscriptionStatus != "active" {
			continue
		}
		if targetDeviceID != "" && d.DeviceID != targetDeviceID {
			continue
		}
		if targetDeviceID == "" && targetWallet != "" && !slices.Contains(d.LinkedWallets, targetWallet) {
			continue
		}
		recipients = append(recipients, cloneDevice(*d))
	}
	return recipients
}

func (a *app) findMessageLocked(deviceID, notificationID string) *inboxMessage {
	for _, msg := range a.state.Messages {
		if msg.DeviceID == deviceID && msg.NotificationID == notificationID {
			return msg
		}
	}
	return nil
}

func (a *app) bumpRevisionLocked() int64 {
	a.state.Revision++
	return a.state.Revision
}

func (a *app) saveStateLocked() error {
	return writeJSONFile(a.statePath, a.state)
}

func normalizeNotification(req debugSendRequest) (notificationPayload, error) {
	payload := req.Notification
	payload.Kind = strings.TrimSpace(payload.Kind)
	if _, ok := supportedKinds[payload.Kind]; !ok {
		return notificationPayload{}, &apiError{Status: http.StatusBadRequest, Message: "notification.kind must be one of voucher.received, swap.completed, offramp.completed"}
	}

	payload.NotificationID = firstNonEmpty(strings.TrimSpace(payload.NotificationID), fmt.Sprintf("dev-%d", time.Now().UnixNano()))
	payload.Title = firstNonEmpty(strings.TrimSpace(payload.Title), defaultTitleForKind(payload.Kind))
	payload.Body = firstNonEmpty(strings.TrimSpace(payload.Body), defaultBodyForKind(payload.Kind))
	payload.TargetURL = firstNonEmpty(strings.TrimSpace(payload.TargetURL), defaultTargetURL)
	priority, err := normalizePriority(payload.Kind, payload.Priority)
	if err != nil {
		return notificationPayload{}, err
	}
	payload.Priority = priority
	payload.CreatedAt = firstNonEmpty(strings.TrimSpace(payload.CreatedAt), nowRFC3339())
	payload.WalletAddressTarget = firstNonEmpty(strings.TrimSpace(payload.WalletAddressTarget), strings.TrimSpace(req.WalletAddress))

	if payload.Title == "" || payload.Body == "" {
		return notificationPayload{}, &apiError{Status: http.StatusBadRequest, Message: "notification title/body could not be resolved"}
	}
	if !isSafeTargetURL(payload.TargetURL) {
		return notificationPayload{}, &apiError{Status: http.StatusBadRequest, Message: "notification.targetUrl must start with /, http://, or https://"}
	}

	return payload, nil
}

func validateSubscription(subscription pushSubscription) error {
	if strings.TrimSpace(subscription.Endpoint) == "" {
		return &apiError{Status: http.StatusBadRequest, Message: "pushSubscription.endpoint is required"}
	}
	if strings.TrimSpace(subscription.Keys.Auth) == "" || strings.TrimSpace(subscription.Keys.P256dh) == "" {
		return &apiError{Status: http.StatusBadRequest, Message: "pushSubscription.keys.auth and pushSubscription.keys.p256dh are required"}
	}
	return nil
}

func normalizePriority(kind, priority string) (string, error) {
	normalizedPriority := strings.ToLower(strings.TrimSpace(priority))
	if normalizedPriority == "" {
		return defaultPriorityForKind(kind), nil
	}
	if _, ok := supportedPriorities[normalizedPriority]; !ok {
		return "", &apiError{Status: http.StatusBadRequest, Message: "notification.priority must be one of very-low, low, normal, high"}
	}
	return normalizedPriority, nil
}

func defaultPriorityForKind(kind string) string {
	if priority, ok := defaultPrioritiesByKind[kind]; ok {
		return priority
	}
	return "high"
}

func authSchemeForEndpoint(endpoint string) webpush.AuthScheme {
	endpoint = strings.ToLower(endpoint)
	if strings.Contains(endpoint, "fcm.googleapis.com") || strings.Contains(endpoint, "googleapis.com") {
		return webpush.WebPush
	}
	return webpush.Vapid
}

func urgencyForPriority(priority string) webpush.Urgency {
	switch strings.ToLower(strings.TrimSpace(priority)) {
	case "very-low":
		return webpush.UrgencyVeryLow
	case "low":
		return webpush.UrgencyLow
	case "normal":
		return webpush.UrgencyNormal
	default:
		return webpush.UrgencyHigh
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, err error) {
	var apiErr *apiError
	if errors.As(err, &apiErr) {
		_ = writeJSON(w, apiErr.Status, map[string]string{"error": apiErr.Message})
		return
	}
	log.Printf("[webpush] internal error: %v", err)
	_ = writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
}

func readJSONBody(r *http.Request, target any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return &apiError{Status: http.StatusBadRequest, Message: fmt.Sprintf("invalid JSON body: %v", err)}
	}
	return nil
}

func readJSONFile(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return json.NewDecoder(file).Decode(target)
}

func writeJSONFile(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tempPath := path + ".tmp"
	file, err := os.Create(tempPath)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(tempPath, path)
}

func parseCursor(value string) (int64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, nil
	}
	var revision int64
	_, err := fmt.Sscanf(value, "%d", &revision)
	return revision, err
}

func cloneDevice(d device) device {
	cloned := d
	if d.PushSubscription != nil {
		subscriptionCopy := *d.PushSubscription
		cloned.PushSubscription = &subscriptionCopy
	}
	cloned.LinkedWallets = append([]string{}, d.LinkedWallets...)
	return cloned
}

func mergeUniqueStrings(existing, incoming []string) []string {
	result := append([]string{}, existing...)
	for _, value := range incoming {
		value = strings.TrimSpace(value)
		if value == "" || slices.Contains(result, value) {
			continue
		}
		result = append(result, value)
	}
	return result
}

func removeString(values []string, target string) []string {
	target = strings.TrimSpace(target)
	if target == "" {
		return append([]string{}, values...)
	}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value != target {
			result = append(result, value)
		}
	}
	return result
}

func parseCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}
	if len(result) == 0 {
		return []string{"*"}
	}
	return result
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func defaultTitleForKind(kind string) string {
	switch kind {
	case "voucher.received":
		return "Voucher received"
	case "swap.completed":
		return "Swap completed"
	case "offramp.completed":
		return "Off-ramp completed"
	default:
		return "CLC notification"
	}
}

func defaultBodyForKind(kind string) string {
	switch kind {
	case "voucher.received":
		return "You received a voucher."
	case "swap.completed":
		return "Your swap completed successfully."
	case "offramp.completed":
		return "Your cash-out completed successfully."
	default:
		return defaultNotification
	}
}

func isSafeTargetURL(value string) bool {
	value = strings.TrimSpace(value)
	return strings.HasPrefix(value, "/") || strings.HasPrefix(value, "https://") || strings.HasPrefix(value, "http://")
}
