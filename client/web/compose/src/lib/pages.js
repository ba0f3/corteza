import { NoID } from '@cortezaproject/corteza-js'

// Probed limits: some deployments 500 when limit exceeds row count or when pageCursor is used.
const PAGE_LIST_PROBE_LIMITS = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512]

export async function fetchAllComposePages (ComposeAPI, namespaceID) {
  let best = []

  for (const limit of PAGE_LIST_PROBE_LIMITS) {
    try {
      const { set } = await ComposeAPI.pageList({
        namespaceID,
        sort: 'weight ASC',
        limit,
      })
      best = set || []
      if (best.length < limit) {
        return best
      }
    } catch (e) {
      if (best.length > 0) {
        return best
      }
      throw e
    }
  }

  return best
}

export function buildPageTreeFromSet (pages) {
  const byID = new Map()
  pages.forEach((p) => {
    byID.set(p.pageID, { ...p, children: [] })
  })

  const roots = []
  byID.forEach((p) => {
    const parentID = p.selfID
    const isRoot = !parentID || parentID === NoID || parentID === '0'
    if (isRoot) {
      roots.push(p)
      return
    }
    const parent = byID.get(parentID)
    if (parent) {
      parent.children.push(p)
    } else {
      roots.push(p)
    }
  })

  return roots
}
