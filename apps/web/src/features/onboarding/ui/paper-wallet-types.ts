/**
 * Screen-local customization for the paper wallet card.
 *
 * Not persisted across sessions. A null logoDataUrl renders the default
 * CLC logo instead of a user-uploaded raster.
 */
export type PaperWalletCustomization = {
	name: string;
	website: string;
	description: string;
	logoDataUrl: string | null;
};
