export const PORTAL_KIND_LABEL = 'portal.kind'
export const PORTAL_KIND_BUSINESS = 'business'

export function isPortalBusinessApp (app = {}) {
  const labels = app.labels || {}
  return String(labels[PORTAL_KIND_LABEL] || '').toLowerCase() === PORTAL_KIND_BUSINESS
}

/**
 * Opt-in business-app view for Corteza One.
 *
 * Backward compatibility is deliberate: installs without any portal-labelled
 * applications keep the stock selector. Once at least one business app exists,
 * non-application-admin users see only business apps while application admins
 * keep the full technical selector.
 */
export function selectPortalApps (apps = [], canManageApplications = false) {
  const businessApps = apps.filter(isPortalBusinessApp)

  if (canManageApplications || businessApps.length === 0) {
    return apps
  }

  return businessApps
}
