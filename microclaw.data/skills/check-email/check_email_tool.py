import imaplib
import email
from email.header import decode_header
import sys
import json
import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

def get_emails(username, password, imap_server="imap.gmail.com", limit=5, search_query=None):
    try:
        mail = imaplib.IMAP4_SSL(imap_server)
        mail.login(username, password)
        mail.select("inbox")

        if search_query:
            status, messages = mail.search(None, f'(OR SUBJECT "{search_query}" BODY "{search_query}")')
        else:
            status, messages = mail.search(None, "ALL")

        if status != 'OK':
            return {"error": "Failed to search emails"}

        mail_ids = messages[0].split()
        latest_ids = mail_ids[-limit:]

        results = []
        for mail_id in reversed(latest_ids):
            res, msg_data = mail.fetch(mail_id, "(RFC822)")
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])

                    subject, encoding = decode_header(msg["Subject"])[0]
                    if isinstance(subject, bytes):
                        subject = subject.decode(encoding if encoding else "utf-8")

                    from_ = msg.get("From")

                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            content_type = part.get_content_type()
                            content_disposition = str(part.get("Content-Disposition"))
                            try:
                                if content_type == "text/plain" and "attachment" not in content_disposition:
                                    body = part.get_payload(decode=True).decode()
                                    break
                            except:
                                pass
                    else:
                        body = msg.get_payload(decode=True).decode()

                    results.append({
                        "subject": subject,
                        "from": from_,
                        "date": msg.get("Date"),
                        "snippet": body[:200].replace('\n', ' ').strip() + "..."
                    })

        mail.logout()
        return {"emails": results}

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    email_addr = os.getenv('EMAIL_ADDRESS')
    pwd = os.getenv('EMAIL_PASSWORD')
    srv = os.getenv('IMAP_SERVER', 'imap.gmail.com')
    lim = int(os.getenv('EMAIL_FETCH_LIMIT', '10'))
    search = None

    if len(sys.argv) >= 2:
        if sys.argv[1] == "search" and len(sys.argv) >= 3:
            search = sys.argv[2]
            if len(sys.argv) >= 4:
                lim = int(sys.argv[3])
        else:
            email_addr = sys.argv[1]
            if len(sys.argv) >= 3:
                pwd = sys.argv[2]
            if len(sys.argv) >= 4:
                srv = sys.argv[3]
            if len(sys.argv) >= 5:
                lim = int(sys.argv[4])
            if len(sys.argv) >= 6:
                search = sys.argv[5]

    if not email_addr or not pwd:
        print(json.dumps({"error": "Email credentials not found. Set EMAIL_ADDRESS and EMAIL_PASSWORD in this skill folder's .env or pass as args: python3 check_email_tool.py <email> <password> [server] [limit] [search_query]"}))
        sys.exit(1)

    output = get_emails(email_addr, pwd, srv, lim, search)
    print(json.dumps(output, indent=2))
