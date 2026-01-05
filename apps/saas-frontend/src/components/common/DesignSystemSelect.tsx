import { FC } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DesignSystemSelectProps {
  value?: string
  onValueChange?: (value: string) => void
  designSystems?: Array<{ id: string; name: string }>
}

export const DesignSystemSelect: FC<DesignSystemSelectProps> = ({
  value,
  onValueChange,
  designSystems = []
}) => {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select design system" />
      </SelectTrigger>
      <SelectContent>
        {designSystems.map((ds) => (
          <SelectItem key={ds.id} value={ds.id}>
            {ds.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default DesignSystemSelect
