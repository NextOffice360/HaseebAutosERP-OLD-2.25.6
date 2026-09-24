import io
p='MASTER-REQUIREMENTS.md'; s=io.open(p,encoding='utf-8').read()
add = open('tmp/part2_block.md', encoding='utf-8').read()
s = s.rstrip() + "\n\n" + add
io.open(p,'w',encoding='utf-8').write(s); print('MASTER-REQUIREMENTS ->', len(s), 'bytes')

p2='ATTACHMENTS-INDEX.md'; a=io.open(p2,encoding='utf-8').read()
rows=[l for l in a.split('\n') if l.startswith('| `Application-Wide Performance')]
print('index row found:', bool(rows))
if rows:
    r=rows[0]
    new_r = ('| `Application-Wide Performance, Dynamic UI, Shared Logic, AI Agent \u2014 Application-Wide '
             'Engineering, Performance.md` | **Master spec**: Part 1 = 18 sections + FINAL AGENT RULE \u00b7 '
             'Part 2 = companion detail (7 perf problems \u00b7 12-item missing-shared-logic audit \u00b7 '
             '9 loading-UX shartein \u00b7 visibility fields \u00b7 sidebar states \u00b7 P1\u2013P4 priority \u00b7 '
             '10 "immediate issues" scoreboard) | Whole app | **Har wave se pehle** (W3 \u00a76.3/6.4, W4 \u00a76.5, '
             'W5 \u00a76.6, W6 \u00a76.7, W10 \u00a76.8) \u2014 map `MASTER-REQUIREMENTS.md \u25b8 6` |')
    a=a.replace(r,new_r,1)
    io.open(p2,'w',encoding='utf-8').write(a); print('ATTACHMENTS-INDEX row updated')
