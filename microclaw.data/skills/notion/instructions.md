# Notion Skill

This skill allows the agent to interact with a Notion workspace using the Notion API.

## Available Tools

- `python3 notion_tool.py search <query>`: Search for pages or databases.
- `python3 notion_tool.py get_page <page_id>`: Get metadata for a specific page.
- `python3 notion_tool.py get_blocks <block_id>`: Get the content (children blocks) of a page or block.
- `python3 notion_tool.py append <block_id> "text"`: Append a simple paragraph to a page or block.

## Setup
The skill requires a `NOTION_TOKEN` file in its directory containing a valid Notion Internal Integration Token. Ensure the integration has been shared with the relevant pages in Notion.
