-- Create figma_credentials table for storing encrypted tokens and client secrets
CREATE TABLE IF NOT EXISTS public.figma_credentials (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL, -- Encrypted
    access_token TEXT, -- Encrypted
    refresh_token TEXT, -- Encrypted
    expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT figma_credentials_user_id_key UNIQUE (user_id)
);

-- Add comment for security context
COMMENT ON TABLE public.figma_credentials IS 'Stores user-provided Figma App credentials and OAuth tokens. Secrets and tokens are encrypted at rest.';

-- Enable Row Level Security
ALTER TABLE public.figma_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own credentials
CREATE POLICY "Users can view their own figma credentials" 
ON public.figma_credentials FOR SELECT 
USING (auth.uid() = user_id);

-- Policy: Users can insert their own credentials
CREATE POLICY "Users can insert their own figma credentials" 
ON public.figma_credentials FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own credentials
CREATE POLICY "Users can update their own figma credentials" 
ON public.figma_credentials FOR UPDATE 
USING (auth.uid() = user_id);

-- Policy: Users can delete their own credentials
CREATE POLICY "Users can delete their own figma credentials" 
ON public.figma_credentials FOR DELETE 
USING (auth.uid() = user_id);
