import pyfiglet

from defeatbeta_api.__version__ import __version__
from defeatbeta_api.client.hugging_face_client import HuggingFaceClient
import nltk
import os

from defeatbeta_api.utils.util import validate_nltk_directory

if not os.getenv("DEFEATBETA_NO_NLTK_DOWNLOAD"):
    nltk.download('punkt_tab', download_dir=validate_nltk_directory("nltk"))

_welcome_printed = False
data_update_time = ""

def _print_welcome():
    global _welcome_printed
    global data_update_time
    if not _welcome_printed:
        try:
            client = HuggingFaceClient()
            data_update_time = client.get_data_update_time()
        except (RuntimeError, Exception) as e:
            # Handle rate limits or network errors gracefully
            if "429" in str(e) or "Too Many Requests" in str(e):
                data_update_time = "Rate limited - unable to fetch"
                print("[WARNING] HuggingFace rate limit hit. Continuing without data update time.")
            else:
                data_update_time = "Unable to fetch"
                print(f"[WARNING] Failed to fetch data update time: {e}")
        
        text = "Defeat Beta"
        ascii_lines = pyfiglet.figlet_format(text, font="doom").split('\n')
        ascii_art = '\n'.join(line for line in ascii_lines if line.strip())
        colored_art = "\033[38;5;10m" + ascii_art + "\033[0m"
        print(f"{colored_art}\n"
              f"\033[1;38;5;10m📈:: Data Update Time ::\033[0m\t{data_update_time} \033[1;38;5;10m::\033[0m\n"
              f"\033[1;38;5;10m📈:: Software Version ::\033[0m\t{__version__}      \033[1;38;5;10m::\033[0m")
        _welcome_printed = True

if not os.getenv("DEFEATBETA_NO_WELCOME"):
    _print_welcome()
