export type Html5QrcodeModule = typeof import("html5-qrcode");

export function loadHtml5Qrcode(): Promise<Html5QrcodeModule> {
  return import("html5-qrcode");
}
