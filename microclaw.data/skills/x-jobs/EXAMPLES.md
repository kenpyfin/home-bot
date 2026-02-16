# X Jobs - Quick Reference Examples

## Basic Search
```bash
# Search for Python jobs
python3 x_jobs_tool.py search --keyword "python" --format pretty

# Search for remote AI engineer jobs
python3 x_jobs_tool.py search --keyword "AI engineer" --location-type remote --format pretty
```

## Advanced Filtering
```bash
# Senior Python roles, remote only, full-time
python3 x_jobs_tool.py search \
  --keyword "python" \
  --location-type remote \
  --seniority "senior,lead" \
  --employment full_time \
  --format pretty

# Jobs at specific company
python3 x_jobs_tool.py search \
  --keyword "software engineer" \
  --company "Google" \
  --format pretty

# Entry-level positions
python3 x_jobs_tool.py search \
  --keyword "developer" \
  --seniority "entry_level,junior" \
  --format pretty
```

## JSON Output (for parsing)
```bash
# Get JSON output for scripting/automation
python3 x_jobs_tool.py search \
  --keyword "backend engineer" \
  --location-type remote \
  --format json | jq '.jobs[] | {title, company, salary}'
```

## Search Parameters Reference

### Location Types
- `remote` - Remote positions
- `onsite` - On-site positions  
- `hybrid` - Hybrid positions
- Comma-separated for multiple: `remote,hybrid`

### Seniority Levels
- `intern` - Internships
- `entry_level` - Entry level
- `junior` - Junior positions
- `mid_level` - Mid-level
- `senior` - Senior positions
- `lead` - Lead/Staff positions
- `manager` - Management roles

### Employment Types
- `full_time` - Full-time
- `part_time` - Part-time
- `full_time_contract` - Contract (full-time)
- `contract_to_hire` - Contract-to-hire

## Example Use Cases

### 1. Daily Job Alert Script
```bash
#!/bin/bash
# Save as check_jobs.sh

python3 x_jobs_tool.py search \
  --keyword "python developer" \
  --location-type remote \
  --seniority "mid_level,senior" \
  --format pretty > daily_jobs.txt

# Email or notify yourself with the results
```

### 2. Compare Multiple Keywords
```bash
# Search for different roles
for role in "python" "AI engineer" "backend" "devops"; do
  echo "=== $role Jobs ==="
  python3 x_jobs_tool.py search --keyword "$role" --location-type remote --format pretty | head -20
  echo ""
done
```

### 3. Filter by Salary (using jq)
```bash
# Find high-paying jobs
python3 x_jobs_tool.py search \
  --keyword "senior engineer" \
  --format json | \
  jq '.jobs[] | select(.salary != "Not specified") | {title, company, salary}'
```

## Common Search Queries

| What you want | Command |
|--------------|---------|
| Remote Python jobs | `--keyword "python" --location-type remote` |
| Senior roles | `--keyword "engineer" --seniority senior` |
| Specific company | `--keyword "developer" --company "Microsoft"` |
| Entry level | `--keyword "developer" --seniority "entry_level,junior"` |
| Contract work | `--keyword "developer" --employment "contract_to_hire"` |
