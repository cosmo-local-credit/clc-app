const KEY = "clc_profileCompleted";

export function getProfileCompleted(): boolean {
	if (typeof localStorage === "undefined") return false;
	return localStorage.getItem(KEY) === "true";
}

export function markProfileCompleted(): void {
	localStorage.setItem(KEY, "true");
}

export function clearProfileCompleted(): void {
	localStorage.removeItem(KEY);
}
