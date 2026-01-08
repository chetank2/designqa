import { FC, useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { unifiedApiService } from '../../services/unified-api'

interface DesignSystemSelectProps {
  value?: string
  onChange?: (value: string) => void
  onValueChange?: (value: string) => void
  disabled?: boolean
  designSystems?: Array<{ id: string; name: string }>
}

export const DesignSystemSelect: FC<DesignSystemSelectProps> = ({
  value,
  onChange,
  onValueChange,
  disabled,
  designSystems: propDesignSystems
}) => {
  // Ensure controlled behavior by providing a default empty string value
  const controlledValue = value ?? '';

  const handleValueChange = (newValue: string) => {
    onChange?.(newValue);
    onValueChange?.(newValue);
  };
  const [designSystems, setDesignSystems] = useState<Array<{ id: string; name: string }>>(propDesignSystems || [])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // If design systems are provided as props, use them
    if (propDesignSystems && propDesignSystems.length > 0) {
      setDesignSystems(propDesignSystems)
      return
    }

    // Otherwise, fetch from API
    const fetchDesignSystems = async () => {
      setIsLoading(true)
      try {
        const response = await unifiedApiService.getDesignSystems()
        if (response.success && response.data) {
          setDesignSystems(response.data.map(ds => ({
            id: ds.id,
            name: ds.name
          })))
        }
      } catch (error) {
        console.error('Failed to fetch design systems:', error)
        // Provide fallback built-in design systems
        setDesignSystems([
          { id: 'shadcn', name: 'ShadCN UI' },
          { id: 'ft-design', name: 'FT Design System' }
        ])
      } finally {
        setIsLoading(false)
      }
    }

    fetchDesignSystems()
  }, [propDesignSystems])

  return (
    <Select value={controlledValue} onValueChange={handleValueChange} disabled={disabled || isLoading}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading design systems..." : "Select design system"} />
      </SelectTrigger>
      <SelectContent>
        {designSystems.map((ds) => (
          <SelectItem key={ds.id} value={ds.id}>
            {ds.name}
          </SelectItem>
        ))}
        {designSystems.length === 0 && !isLoading && (
          <SelectItem value="__no_systems__" disabled>
            No design systems available
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}

export default DesignSystemSelect
