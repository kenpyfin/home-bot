#!/usr/bin/env python3
"""
RapidAPI Tool - Generic client for calling RapidAPI endpoints
"""
import os
import sys
import json
import requests
from pathlib import Path
from urllib.parse import urlencode

SKILL_DIR = Path(__file__).parent
ENV_FILE = SKILL_DIR / ".env"

def load_api_keys():
    """Load all RAPIDAPI_KEY* variables from .env file"""
    keys = {}
    if not ENV_FILE.exists():
        return keys
    
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                if key.startswith('RAPIDAPI_KEY'):
                    # Extract name: RAPIDAPI_KEY -> "default", RAPIDAPI_KEY_LINKEDIN -> "linkedin"
                    if key == 'RAPIDAPI_KEY':
                        name = 'default'
                    else:
                        name = key.replace('RAPIDAPI_KEY_', '').lower()
                    keys[name] = value.strip()
    return keys

def call_api(host, endpoint, method='GET', params=None, key_name='default', body=None):
    """Call a RapidAPI endpoint"""
    keys = load_api_keys()
    
    if key_name not in keys:
        return {
            "error": f"API key '{key_name}' not found. Available keys: {list(keys.keys())}",
            "hint": "Add the key to .env file as RAPIDAPI_KEY or RAPIDAPI_KEY_{NAME}"
        }
    
    api_key = keys[key_name]
    url = f"https://{host}{endpoint}"
    
    headers = {
        'X-RapidAPI-Key': api_key,
        'X-RapidAPI-Host': host
    }
    
    # Add query parameters to URL
    if params:
        url = f"{url}?{urlencode(params)}"
    
    # Add Content-Type for POST requests with body
    if method == 'POST' and body:
        headers['Content-Type'] = 'application/json'
    
    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, timeout=30)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=body, timeout=30)
        else:
            return {"error": f"Unsupported method: {method}"}
        
        # Try to parse JSON response
        try:
            data = response.json()
        except:
            data = {"text": response.text}
        
        return {
            "status_code": response.status_code,
            "success": response.ok,
            "data": data,
            "url": url,
            "method": method
        }
    
    except requests.exceptions.RequestException as e:
        return {
            "error": str(e),
            "url": url,
            "method": method
        }

def list_keys():
    """List all configured API keys"""
    keys = load_api_keys()
    if not keys:
        return {
            "message": "No API keys configured",
            "hint": f"Create {ENV_FILE} with RAPIDAPI_KEY=your_key_here"
        }
    
    return {
        "configured_keys": list(keys.keys()),
        "count": len(keys),
        "env_file": str(ENV_FILE)
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: rapidapi_tool.py <command> [args...]",
            "commands": {
                "call": "call <api_host> <endpoint> [--method GET|POST] [--params key=value ...] [--key-name default] [--body '{json}']",
                "list-keys": "list-keys"
            }
        }, indent=2))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'list-keys':
        result = list_keys()
        print(json.dumps(result, indent=2))
    
    elif command == 'call':
        if len(sys.argv) < 4:
            print(json.dumps({
                "error": "Usage: call <api_host> <endpoint> [--method GET|POST] [--params key=value ...] [--key-name default] [--body '{json}']"
            }, indent=2))
            sys.exit(1)
        
        host = sys.argv[2]
        endpoint = sys.argv[3]
        method = 'GET'
        params = {}
        key_name = 'default'
        body = None
        
        # Parse optional arguments
        i = 4
        while i < len(sys.argv):
            arg = sys.argv[i]
            if arg == '--method' and i + 1 < len(sys.argv):
                method = sys.argv[i + 1].upper()
                i += 2
            elif arg == '--key-name' and i + 1 < len(sys.argv):
                key_name = sys.argv[i + 1]
                i += 2
            elif arg == '--body' and i + 1 < len(sys.argv):
                try:
                    body = json.loads(sys.argv[i + 1])
                except json.JSONDecodeError as e:
                    print(json.dumps({"error": f"Invalid JSON body: {e}"}, indent=2))
                    sys.exit(1)
                i += 2
            elif arg == '--params':
                # Collect all key=value pairs until next flag
                i += 1
                while i < len(sys.argv) and not sys.argv[i].startswith('--'):
                    if '=' in sys.argv[i]:
                        k, v = sys.argv[i].split('=', 1)
                        params[k] = v
                    i += 1
            else:
                i += 1
        
        result = call_api(host, endpoint, method, params, key_name, body)
        print(json.dumps(result, indent=2))
    
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}, indent=2))
        sys.exit(1)

if __name__ == '__main__':
    main()
