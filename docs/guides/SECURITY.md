# Security Guidelines

## 🚨 API Token Security

> Note: Figma tokens are only relevant if you are using Figma API/MCP. If not, you can ignore the `FIGMA_*` guidance below.

### NEVER commit sensitive data to version control:
- ❌ API tokens (`figd_*`)
- ❌ Access keys
- ❌ Passwords
- ❌ Secret configurations
- ❌ Generated reports containing tokens

### ✅ Secure Setup Process:

1. **Copy configuration template:**
   ```bash
   cp config.example.json config.json
   ```

2. **Add your Figma token (only if using Figma API/MCP):**
   ```json
   {
     "accessToken": "figd_your_actual_token_here"
   }
   ```

3. **Verify .gitignore excludes sensitive files:**
   - `config.json` ✅ Excluded
   - `output/reports/` ✅ Excluded
   - `**/*token*` ✅ Excluded

### 🔒 Environment Variables (Recommended)

Instead of `config.json`, use environment variables (only if using Figma API/MCP):

```bash
export FIGMA_ACCESS_TOKEN="figd_your_token_here"
export SERVER_PORT="3006"
```

Update code to read from environment:
```javascript
const accessToken = process.env.FIGMA_ACCESS_TOKEN || config.accessToken;
```

### 🛡️ Token Management

- **Create tokens with minimal permissions**
- **Rotate tokens regularly**
- **Revoke immediately if exposed**
- **Monitor GitHub for accidental commits**

### 🔍 Security Checklist

Before committing:
- [ ] No tokens in `config.json`
- [ ] No sensitive data in reports
- [ ] `.gitignore` updated
- [ ] Environment variables used

### 📞 Incident Response

If a token is exposed:
1. **Immediately revoke** the token in Figma settings
2. **Generate new token** with fresh permissions
3. **Remove from Git history** using `git filter-branch`
4. **Update all environments** with new token
5. **Review access logs** for unauthorized usage

### 🔗 Resources

- [Figma Token Management](https://www.figma.com/developers/api#access-tokens)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [Git Filter Branch](https://git-scm.com/docs/git-filter-branch) 
