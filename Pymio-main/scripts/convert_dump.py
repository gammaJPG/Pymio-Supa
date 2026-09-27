"""Convert the supplied plain pg_dump to SQL accepted by Supabase SQL Editor."""
from pathlib import Path
import re
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
lines = source.read_text(encoding='utf-8').splitlines()
out = ['-- Import once into an empty Supabase project. Generated from inventario_app.', 'BEGIN;']
counts = {}
i = 0
while i < len(lines):
    line = lines[i]
    i += 1
    match = re.fullmatch(r'COPY (public\.\w+) (\(.*\)) FROM stdin;', line)
    if match:
        table, columns = match.groups()
        counts[table] = 0
        while lines[i] != r'\.':
            values = []
            for value in lines[i].split('\t'):
                if value == r'\N':
                    values.append('NULL')
                else:
                    value = re.sub(r'\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)', lambda m: chr(int(m[1], 16)) if m[1].startswith('x') else chr(int(m[1], 8)) if m[1][0].isdigit() else {'b':'\b','f':'\f','n':'\n','r':'\r','t':'\t','v':'\v'}.get(m[1],m[1]), value)
                    values.append("'" + value.replace("'", "''") + "'")
            out.append(f'INSERT INTO {table} {columns} VALUES ({", ".join(values)});')
            counts[table] += 1
            i += 1
        i += 1
    elif line.startswith('\\') or ' OWNER TO ' in line or line.startswith('SET ') or line.startswith('SELECT pg_catalog.set_config'):
        continue
    else:
        # pg18 emits named NOT NULL syntax unavailable on older Supabase versions.
        out.append(re.sub(r'CONSTRAINT \w+ NOT NULL', 'NOT NULL', line))
for table in counts:
    out.extend([f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;', f'REVOKE ALL ON {table} FROM anon, authenticated;', f'GRANT ALL ON {table} TO service_role;'])
out.extend(['GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;', 'COMMIT;'])
target.write_text('\n'.join(out) + '\n', encoding='utf-8')
print(counts)
