import { DEFAULT_SERVER_PORT, getApiBaseUrl } from '../config/ports'

const LOCAL_API_BASE = `http://localhost:${DEFAULT_SERVER_PORT}`

type MigrationResult = {
  success: boolean
  count: number
  errors?: string[]
}

export const migrateDesignSystem = async (
  system: any,
  token?: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/design-systems`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(system)
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.error || 'Failed to migrate design system')
    }

    const payload = await response.json()
    return { success: true, data: payload.data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Migration failed' }
  }
}

export const migrateData = async (
  type: 'design-systems' | 'credentials',
  token?: string,
  direction: 'to_cloud' | 'to_local' = 'to_cloud'
): Promise<MigrationResult> => {
  const sourceBase = direction === 'to_cloud' ? LOCAL_API_BASE : getApiBaseUrl()
  const targetBase = direction === 'to_cloud' ? getApiBaseUrl() : LOCAL_API_BASE

  try {
    const listResponse = await fetch(`${sourceBase}/api/${type}`)
    if (!listResponse.ok) {
      throw new Error(`Failed to load ${type} from ${sourceBase}`)
    }
    const listPayload = await listResponse.json()
    const items = Array.isArray(listPayload.data) ? listPayload.data : []

    const errors: string[] = []
    let migrated = 0

    for (const item of items) {
      const response = await fetch(`${targetBase}/api/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && direction === 'to_cloud' ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(item)
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        errors.push(payload.error || `Failed to migrate ${type} item`)
        continue
      }

      migrated += 1
    }

    return { success: errors.length === 0, count: migrated, errors: errors.length ? errors : undefined }
  } catch (error: any) {
    return { success: false, count: 0, errors: [error.message || 'Migration failed'] }
  }
}

export const checkMigrationNeeded = (_version: string) => {
  return false
}
