-- =============================================================================
-- FIGMA API KEYS (User-specific)
-- =============================================================================

CREATE TABLE public.figma_api_keys (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  api_key TEXT NOT NULL, -- Encrypted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.figma_api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own figma api key
CREATE POLICY "Users can view their own figma api key"
  ON public.figma_api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own figma api key
CREATE POLICY "Users can insert their own figma api key"
  ON public.figma_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own figma api key
CREATE POLICY "Users can update their own figma api key"
  ON public.figma_api_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own figma api key
CREATE POLICY "Users can delete their own figma api key"
  ON public.figma_api_keys FOR DELETE
  USING (auth.uid() = user_id);
