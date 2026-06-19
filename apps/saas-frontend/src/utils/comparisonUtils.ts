import { ComparisonResult } from '@/types'

// Helper function to calculate similarity percentage
export const calculateSimilarity = (matched: number, total: number): number => {
    if (total === 0) return 0
    return Math.round((matched / total) * 100)
}

const asArray = (value: any): any[] => {
    if (!value) return []
    if (Array.isArray(value)) return value
    if (value instanceof Set) return Array.from(value)
    if (typeof value === 'object') {
        if (Array.isArray(value.items)) return value.items
        if (Array.isArray(value.values)) return value.values
        return Object.values(value).flatMap((item: any) => Array.isArray(item) ? item : [item])
    }
    return [value]
}

const getTokenValue = (token: any): string => {
    if (token === undefined || token === null) return ''
    if (typeof token !== 'object') return String(token)
    return String(
        token.value ??
        token.hex ??
        token.color ??
        token.fontFamily ??
        token.family ??
        token.name ??
        ''
    )
}

const uniqueTokens = (tokens: any[]): any[] => {
    const seen = new Set<string>()
    return asArray(tokens).filter((token: any) => {
        const key = getTokenValue(token).toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
    })
}

const collectStyleTokens = (items: any[], properties: string[]): any[] => {
    const values: any[] = []
    asArray(items).forEach((item: any) => {
        const styleSources = [item?.styles, item?.style, item?.computedStyles, item?.css, item]
        styleSources.forEach((styles: any) => {
            if (!styles || typeof styles !== 'object') return
            properties.forEach((property) => {
                const value = styles[property]
                if (value !== undefined && value !== null && value !== '') values.push(value)
            })
        })
    })
    return values
}

const normalizeTypographyTokens = (tokens: any): any[] => {
    if (!tokens) return []
    if (!Array.isArray(tokens) && typeof tokens === 'object') {
        const families = asArray(tokens.fontFamilies)
        const sizes = asArray(tokens.fontSizes)
        const weights = asArray(tokens.fontWeights)

        if (families.length || sizes.length || weights.length) {
            const count = Math.max(families.length, sizes.length, weights.length)
            return Array.from({ length: count }, (_, index) => ({
                fontFamily: families[index] || families[0] || 'Unknown',
                fontSize: sizes[index] || sizes[0] || '',
                fontWeight: weights[index] || weights[0] || ''
            }))
        }
    }
    return asArray(tokens)
}

const getVisualTokens = (
    result: ComparisonResult,
    source: 'figma' | 'web',
    category: 'colors' | 'typography' | 'spacing' | 'borderRadius'
): any[] => {
    const data = source === 'figma' ? result?.figmaData : result?.webData
    const details = source === 'figma' ? result?.extractionDetails?.figma : result?.extractionDetails?.web
    const components = source === 'figma'
        ? ((data as any)?.components || (data as any)?.elements || [])
        : ((data as any)?.elements || (data as any)?.components || [])

    const sources: Record<typeof category, any[]> = {
        colors: [
            (data as any)?.colors,
            (data as any)?.colorPalette,
            (data as any)?.designTokens?.colors,
            details?.colors,
            source === 'figma' ? result?.colorAnalysis?.figmaColors : result?.colorAnalysis?.webColors,
            source === 'figma' ? result?.comparison?.colorAnalysis?.figmaColors : result?.comparison?.colorAnalysis?.webColors,
            collectStyleTokens(components, ['color', 'backgroundColor', 'background-color', 'fill', 'stroke'])
        ],
        typography: [
            (data as any)?.typography,
            (data as any)?.fonts,
            (data as any)?.designTokens?.typography,
            details?.typography,
            collectStyleTokens(components, ['fontFamily', 'font-family', 'fontSize', 'font-size'])
        ],
        spacing: [
            (data as any)?.spacing,
            (data as any)?.designTokens?.spacing,
            details?.spacing,
            collectStyleTokens(components, [
                'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
                'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
                'gap', 'rowGap', 'columnGap', 'row-gap', 'column-gap'
            ])
        ],
        borderRadius: [
            (data as any)?.borderRadius,
            (data as any)?.borders,
            (data as any)?.radius,
            (data as any)?.designTokens?.borderRadius,
            (data as any)?.designTokens?.radius,
            (details as any)?.borderRadius,
            (details as any)?.radius,
            collectStyleTokens(components, [
                'borderRadius', 'border-radius',
                'borderTopLeftRadius', 'border-top-left-radius',
                'borderTopRightRadius', 'border-top-right-radius',
                'borderBottomLeftRadius', 'border-bottom-left-radius',
                'borderBottomRightRadius', 'border-bottom-right-radius'
            ])
        ]
    }

    const tokens = sources[category].flatMap((value) =>
        category === 'typography' ? normalizeTypographyTokens(value) : asArray(value)
    )

    return uniqueTokens(tokens)
}

// Helper function to extract color comparison data
export const getColorComparisonData = (result: ComparisonResult) => {
    const analysis = result?.colorAnalysis || result?.comparison?.colorAnalysis
    let figmaColors = getVisualTokens(result, 'figma', 'colors')
    let webColors = getVisualTokens(result, 'web', 'colors')
    let matched = analysis?.matchedColors || []
    let missing = analysis?.missingColors || []
    let extra = analysis?.extraColors || []

    // Normalize data
    figmaColors = Array.isArray(figmaColors) ? figmaColors : []
    webColors = Array.isArray(webColors) ? webColors : []
    matched = Array.isArray(matched) ? matched : []
    missing = Array.isArray(missing) ? missing : []
    extra = Array.isArray(extra) ? extra : []

    if (figmaColors.length === 0 && webColors.length === 0) return null

    return {
        figmaTokens: figmaColors,
        webTokens: webColors,
        matchedTokens: matched.map((m: any) => ({
            figma: m.figma || m.figmaColor,
            web: m.web || m.developedColor,
            similarity: m.similarity || m.matchPercentage || 100
        })),
        missingTokens: missing,
        extraTokens: extra,
        similarity: analysis?.similarity || calculateSimilarity(matched.length, figmaColors.length)
    }
}

// Helper function to extract typography comparison data
export const getTypographyComparisonData = (result: ComparisonResult) => {
    let figmaTypography = getVisualTokens(result, 'figma', 'typography')
    let webTypography = getVisualTokens(result, 'web', 'typography')

    if (!Array.isArray(figmaTypography) && typeof figmaTypography === 'object') figmaTypography = Object.values(figmaTypography)
    if (!Array.isArray(webTypography) && typeof webTypography === 'object') webTypography = Object.values(webTypography)

    figmaTypography = Array.isArray(figmaTypography) ? figmaTypography : []
    webTypography = Array.isArray(webTypography) ? webTypography : []

    // Simplified matching
    const matched: any[] = []
    const missing: any[] = []
    const extra: any[] = []

    figmaTypography.forEach((figmaFont: any) => {
        const webMatch = webTypography.find((webFont: any) =>
            webFont.fontFamily?.toLowerCase() === figmaFont.fontFamily?.toLowerCase()
        )
        if (webMatch) matched.push({ figma: figmaFont, web: webMatch, similarity: 90 })
        else missing.push(figmaFont)
    })

    return {
        figmaTokens: figmaTypography,
        webTokens: webTypography,
        matchedTokens: matched,
        missingTokens: missing,
        extraTokens: extra,
        similarity: calculateSimilarity(matched.length, figmaTypography.length)
    }
}

// Helper function to extract spacing comparison data
export const getSpacingComparisonData = (result: ComparisonResult) => {
    let figmaSpacing = getVisualTokens(result, 'figma', 'spacing')
    let webSpacing = getVisualTokens(result, 'web', 'spacing')

    figmaSpacing = Array.isArray(figmaSpacing) ? figmaSpacing : []
    webSpacing = Array.isArray(webSpacing) ? webSpacing : []

    if (figmaSpacing.length === 0 && webSpacing.length === 0) return null

    // Mock match for UI demo if no deep logic available
    const matched = figmaSpacing.filter((s: any) => webSpacing.includes(s)).map((s: any) => ({ figma: s, web: s, similarity: 100 }))

    return {
        figmaTokens: figmaSpacing,
        webTokens: webSpacing,
        matchedTokens: matched,
        missingTokens: [],
        extraTokens: [],
        similarity: calculateSimilarity(matched.length, figmaSpacing.length)
    }
}

// Helper function to extract border radius comparison data
export const getBorderRadiusComparisonData = (result: ComparisonResult) => {
    let figmaBorderRadius = getVisualTokens(result, 'figma', 'borderRadius')
    let webBorderRadius = getVisualTokens(result, 'web', 'borderRadius')

    figmaBorderRadius = Array.isArray(figmaBorderRadius) ? figmaBorderRadius : []
    webBorderRadius = Array.isArray(webBorderRadius) ? webBorderRadius : []

    if (figmaBorderRadius.length === 0 && webBorderRadius.length === 0) return null

    const matched = figmaBorderRadius.filter((s: any) => webBorderRadius.includes(s)).map((s: any) => ({ figma: s, web: s, similarity: 100 }))

    return {
        figmaTokens: figmaBorderRadius,
        webTokens: webBorderRadius,
        matchedTokens: matched,
        missingTokens: [],
        extraTokens: [],
        similarity: calculateSimilarity(matched.length, figmaBorderRadius.length)
    }
}
