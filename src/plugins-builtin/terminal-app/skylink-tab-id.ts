/**
 * SkyLink tab id, kept in a dependency-free module so the site tab and close-up
 * modal can link to the app without importing the dashboard (which pulls in
 * PhasedArrayCore and closes an import cycle through AntennaCore).
 */
export const SKYLINK_TAB_ID = 'skylink-app';
