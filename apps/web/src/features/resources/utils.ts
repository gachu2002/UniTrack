import type { ResourceLink } from '@/types/api'

export function resourcesForTarget(resources: ResourceLink[], type: ResourceLink['relatedType'], id: string) {
  return resources.filter((resource) => resource.relatedType === type && resource.relatedId === id)
}
