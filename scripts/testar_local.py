"""Start a dependency-free local server for testing Psyco_Visão on this laptop."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

ROOT = Path(__file__).resolve().parent.parent


class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = True


def main():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = LocalServer(("127.0.0.1", 0), handler)
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print("Psyco_Visão aberto para teste local.")
    print(f"Endereço: {url}")
    print("Para encerrar o servidor, feche esta janela ou pressione Ctrl+C.")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor de teste encerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
