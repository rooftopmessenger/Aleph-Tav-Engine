import subprocess
import time
import sys
import os

print("Starting uvicorn directly from virtualenv...")
venv_python = os.path.join(".venv", "Scripts", "python.exe")

with open("server.log", "w", encoding="utf-8") as f:
    proc = subprocess.Popen(
        [venv_python, "-u", "-m", "uvicorn", "main:app", "--port", "8000"],
        stdout=f,
        stderr=subprocess.STDOUT,
        bufsize=1,  # Line buffered
        text=True
    )
    print(f"Server started with PID {proc.pid}")
    
    # Wait 10 seconds to allow model loading
    time.sleep(10)
    if proc.poll() is None:
        print("Server is running.")
        sys.stdout.flush()
        
        # Keep-alive loop to prevent task runner from terminating the process tree
        try:
            while proc.poll() is None:
                time.sleep(1)
        except KeyboardInterrupt:
            print("Terminating server...")
            proc.terminate()
    else:
        print(f"Server exited with code {proc.returncode}")
