import { expect } from 'chai'
import {
  PORTAL_KIND_LABEL,
  isPortalBusinessApp,
  selectPortalApps,
} from 'corteza-webapp-one/src/lib/portal-apps'

describe('portal application selector', () => {
  const technical = { applicationID: '1', name: 'Low Code', labels: {} }
  const hrm = {
    applicationID: '2',
    name: 'HRM',
    labels: { [PORTAL_KIND_LABEL]: 'business' },
  }

  it('detects business applications by label', () => {
    expect(isPortalBusinessApp(hrm)).to.equal(true)
    expect(isPortalBusinessApp(technical)).to.equal(false)
  })

  it('preserves stock selector when portal mode is not configured', () => {
    expect(selectPortalApps([technical], false)).to.deep.equal([technical])
  })

  it('shows only business apps to non-admin users after opt-in', () => {
    expect(selectPortalApps([technical, hrm], false)).to.deep.equal([hrm])
  })

  it('keeps the full selector for application admins', () => {
    expect(selectPortalApps([technical, hrm], true)).to.deep.equal([technical, hrm])
  })
})
