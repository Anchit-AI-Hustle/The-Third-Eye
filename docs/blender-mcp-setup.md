# Blender MCP — local setup

The Blender MCP lets Claude (Desktop or Claude Code) drive a **local** Blender
instance — create/edit meshes, materials, scenes, and export models (e.g. glTF
avatars you can drop into the Life-OS 3D personas). It runs on **your machine**,
not on the app's server: it needs the Blender GUI and a socket the addon opens,
so it can't run in the cloud/headless environment the web app deploys to.

## One-time setup

1. **Install Blender** (4.x) from https://www.blender.org/download/.
2. **Install `uv`** (the Python runner the server uses):
   - macOS: `brew install uv`  ·  Windows: `winget install astral-sh.uv`
3. **Install the Blender addon** (`blender-mcp` by @ahujasid):
   - Download `addon.py` from https://github.com/ahujasid/blender-mcp
   - Blender → Edit → Preferences → Add-ons → Install… → pick `addon.py` → enable
     **"Interface: Blender MCP"**.
4. **Start the socket in Blender**: in the 3D viewport press `N` → **BlenderMCP**
   tab → **Connect to Claude**.

## Register the MCP server

### Claude Code (this project)
A ready-to-use config lives at [`.mcp/blender.json`](../.mcp/blender.json). Add it
to your MCP config (or merge into `~/.claude/mcp.json` / your Claude Code MCP
settings):

```jsonc
{
  "mcpServers": {
    "blender": { "command": "uvx", "args": ["blender-mcp"] }
  }
}
```

### Claude Desktop
Settings → Developer → Edit Config, add the same `blender` entry, and restart.

## Use it

With Blender open and "Connect to Claude" active, ask Claude things like:
- "Model a low-poly holographic head and export it as glTF."
- "Build a stylised avatar bust, apply an emissive cyan material, export `.glb`."

Export the result as **glTF/GLB** and hand it to me — the app's 3D personas
(`components/persona/Persona3D.tsx`) are procedural today, but can load a glTF
model per agent once you have one.

> Security note: the MCP executes Blender Python on your machine. Only connect it
> to Claude sessions you trust, and review generated scripts for anything
> destructive before running on important .blend files.
