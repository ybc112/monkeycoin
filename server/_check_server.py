import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("36.151.145.15", username="root", password="Ybc20031213.", timeout=20)

cmds = [
    "python3 -c \"import base64; t=open('/etc/cloudflared/token').read().strip(); p=t.split('.')[1]; p+='='*(-len(p)%4); print(base64.urlsafe_b64decode(p).decode())\" 2>/dev/null | head -c 1000",
    "grep -l 'kimi-vault' /www/server/panel/vhost/nginx/*.conf 2>/dev/null",
    "cat /www/server/panel/vhost/nginx/bstocks-api.conf 2>/dev/null",
]
for cmd in cmds:
    try:
        stdin, stdout, stderr = c.exec_command(cmd, timeout=20)
        out = stdout.read().decode()
        err = stderr.read().decode()
        print("=== ", cmd, " ===")
        print(out.strip() or "(no stdout)")
        if err.strip():
            print("ERR:", err.strip()[:300])
    except Exception as e:
        print("=== ", cmd, " === TIMEOUT/ERR:", e)
c.close()
