/**
 * The asset last selected anywhere, and the ground station last selected.
 *
 * A leaf module (no imports) so surfaces that only need to read the selection,
 * such as SelectedStation, do not import the asset tree sidebar and its UI
 * dependency graph. AssetTreeSidebar writes it and re-exposes it as statics.
 */
export const assetSelectionState: { assetId: string | null; groundStationId: string | null } = {
  assetId: null,
  groundStationId: null,
};
