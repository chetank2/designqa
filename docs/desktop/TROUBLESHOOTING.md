# Desktop App Troubleshooting Guide

## Common Issues

### Token Expired

**Symptoms**:
- Authentication errors
- "Token expired" messages
- Cannot connect to SaaS backend

**Solutions**:
1. **Desktop App**: Go to Settings → Sign Out → Sign In again
2. **SaaS**: Check OAuth token in Settings → Figma Integration
3. **Manual Refresh**: Delete token from keychain and re-authenticate

**Prevention**:
- Enable OAuth instead of Personal Access Token
- OAuth tokens auto-refresh

### Firewall Blocking

**Symptoms**:
- Cannot connect to Desktop MCP
- Port connection errors
- "Connection refused" messages

**Solutions**:

**macOS**:
1. System Preferences → Security & Privacy → Firewall
2. Click "Firewall Options"
3. Add DesignQA to allowed apps
4. Ensure "Block all incoming connections" is unchecked

**Windows**:
1. Windows Defender Firewall → Allow an app
2. Add DesignQA
3. Check both Private and Public networks
4. If using third-party firewall, add exception for DesignQA

**Ports to Allow**:
- 3845 (Figma Desktop MCP)
- 3847 (DesignQA Desktop server)
- 8080 (Alternative MCP port)

### Figma App Not Running

**Symptoms**:
- "Figma Desktop app is not running" message
- Desktop MCP not detected
- Cannot connect to Desktop MCP

**Solutions**:
1. Launch Figma Desktop app
2. Wait for it to fully start
3. Check Figma Desktop settings → Enable MCP server
4. Restart DesignQA Desktop app

**Verification**:
- Check if Figma process is running:
  - macOS: `pgrep -x Figma`
  - Windows: `tasklist | findstr Figma`

### Desktop MCP Port Not Found

**Symptoms**:
- "Desktop MCP port not found" error
- Discovery fails
- Cannot connect

**Solutions**:

**macOS**:
1. Check `/Applications/Figma.app/Contents/Info.plist` for MCP port
2. Try common ports: 3845, 8080, 3000
3. Check if port is listening: `lsof -i :3845`

**Windows**:
1. Check Registry: `HKEY_CURRENT_USER\Software\Figma\Desktop\MCPPort`
2. Try common ports: 3845, 8080, 3000
3. Check if port is listening: `netstat -an | findstr :3845`

**Manual Port Configuration**:
If auto-discovery fails, you can manually specify the port in Desktop app settings.

### Connection Drops Mid-Comparison

**Symptoms**:
- Comparison starts but fails partway through
- "Connection lost" errors
- Partial results

**Solutions**:
1. Check Figma Desktop is still running
2. Verify network connection is stable
3. Check firewall hasn't blocked connection
4. System will auto-fallback to Remote/Proxy MCP
5. Try again - fallback should work automatically

**Prevention**:
- Keep Figma Desktop running during comparisons
- Ensure stable network connection
- Don't put computer to sleep during comparisons

### App Crashes on Startup

**Symptoms**:
- App closes immediately after launch
- No error message
- Cannot start app

**Solutions**:

**Check Logs**:
- macOS: `~/Library/Logs/DesignQA/`
- Windows: `%APPDATA%\DesignQA\logs\`

**Common Causes**:
1. Port 3847 already in use
   - Solution: Kill process using port or change port in settings
2. Corrupted app data
   - Solution: Delete app data directory and restart
3. Missing dependencies
   - Solution: Reinstall app

**Reset App**:
1. Quit app completely
2. Delete app data:
   - macOS: `~/Library/Application Support/DesignQA`
   - Windows: `%APPDATA%\DesignQA`
3. Restart app

### Performance Issues

**Symptoms**:
- Slow comparisons
- High CPU usage
- App becomes unresponsive

**Solutions**:
1. **Close other apps** - Free up system resources
2. **Reduce concurrent comparisons** - Lower max concurrent in settings
3. **Check Figma Desktop** - Ensure it's not using too much memory
4. **Restart apps** - Restart both Figma Desktop and DesignQA Desktop

**Optimization**:
- Use Desktop MCP for faster local extraction
- Reduce comparison timeout if not needed
- Close unused browser tabs if using web version

## Getting Help

### Debug Mode

Enable debug logging:
1. Set environment variable: `DEBUG=mcp:*`
2. Or add to app settings: `debug: true`
3. Check logs for detailed error messages

### Collecting Information

When reporting issues, include:
1. Operating system and version
2. DesignQA Desktop version
3. Figma Desktop version
4. Error messages (from logs)
5. Steps to reproduce
6. Screenshots if applicable

### Log Locations

**macOS**:
- `~/Library/Logs/DesignQA/main.log`
- `~/Library/Logs/DesignQA/renderer.log`

**Windows**:
- `%APPDATA%\DesignQA\logs\main.log`
- `%APPDATA%\DesignQA\logs\renderer.log`

### Support Channels

- GitHub Issues: [Link to repo]
- Email: support@designqa.com
- Documentation: [Link to docs]
