#!/usr/bin/env bash
# Pure bash launcher with retro terminal UI + arrow-key menu.

set -euo pipefail
cd "$(dirname "$0")"

C_RESET="\033[0m"
C_DIM="\033[2m"
C_BOLD="\033[1m"
C_GREEN="\033[1;32m"
C_BLUE="\033[1;34m"
C_CYAN="\033[1;36m"
C_GRAY="\033[90m"

cleanup_screen() {
  tput cnorm 2>/dev/null || true
}

trap cleanup_screen EXIT INT TERM

# print_logo() {
#   printf "%b" "${C_CYAN}"
#   cat <<'EOF'
#                     --                    
#                   :#@@#:                  
#                 .*@@@@@@*.                
#               .+@@@@**@@@@+.              
#             . :*@@@@+=@@@@*: .            
#           .*@#: :#@@@@@@#: :*@*:          
#          .%@@@@*: -%@@%- .*@@@@%.         
#        .: .+@@@@@+..==..+@@@@@+. :.       
#      .=@@*: .+@@@@@++++%@@@@+. .*@@+.     
#    .=%@@@@=   :*@@@@@@@@@@*:   =@@@@%=.   
#   .#@@@@%.   .. :+*@@@@@+: ..   .#@@@@#.  
#    .+@@@@%-.+@%-   @@@@%  -%@*.:#@@@@+.   
#      .*@@@@@@@@%:  @@@@% .#@@@@@@@@*.     
#        :#@@@@@=.   @@@@%   -%@@@@#:       
#          -%@+.     @@@@%    .=@%-         
#            .       @@@@%      ..          
#               :::::@@@@%::::              
#               .+@@@@@@@@@@+.              
#                 :*@@@@@@*:                
#                   :#@@#:                  
#                     --                    
# EOF
#   printf "%b" "${C_RESET}"
# }

print_title() {
  if command -v cfonts >/dev/null 2>&1; then
    cfonts "Lite Task" --font "block" --align "center" --colors "green,cyan" --spaceless
    return
  fi

  if command -v figlet >/dev/null 2>&1; then
    printf "%b" "${C_GREEN}"
    figlet -f slant "Lite Task" || true
    printf "%b" "${C_RESET}"
    return
  fi

  printf "%b" "${C_GREEN}"
  cat <<'EOF'
  _     _ _        _____         _
 | |   (_) |      |_   _|       | |
 | |    _| |_ ___   | | __ _ ___| | __
 | |   | | __/ _ \  | |/ _` / __| |/ /
 | |___| | ||  __/  | | (_| \__ \   <
 |_____|_|\__\___|  \_/\__,_|___/_|\_\
EOF
  printf "%b" "${C_RESET}"
}

draw_menu() {
  local selected="$1"
  clear
  print_title
  echo
  print_logo
  echo
  printf "%bUse UP/DOWN arrows and ENTER to launch. Press q to quit.%b\n\n" "${C_GRAY}" "${C_RESET}"

  if [ "${selected}" -eq 1 ]; then
    printf "%b> DOCKER  %b%b(rebuild + down + up -d)%b\n" "${C_BLUE}" "${C_RESET}" "${C_DIM}" "${C_RESET}"
  else
    printf "  DOCKER  %b(rebuild + down + up -d)%b\n" "${C_DIM}" "${C_RESET}"
  fi

  if [ "${selected}" -eq 0 ]; then
    printf "%b> SOURCE  %b%b(dev + bot)%b\n" "${C_GREEN}" "${C_RESET}" "${C_DIM}" "${C_RESET}"
  else
    printf "  SOURCE  %b(dev + bot)%b\n" "${C_DIM}" "${C_RESET}"
  fi

}

choose_mode() {
  local selected=0
  local key=""

  if ! [ -t 0 ]; then
    echo "source"
    return
  fi

  exec 3>/dev/tty
  tput civis 2>/dev/null || true

  while true; do
    draw_menu "${selected}" >&3
    IFS= read -rsn1 key </dev/tty

    if [[ "${key}" == $'\x1b' ]]; then
      IFS= read -rsn2 key </dev/tty
      case "${key}" in
        "[A") selected=$(( (selected - 1 + 2) % 2 )) ;;
        "[B") selected=$(( (selected + 1) % 2 )) ;;
      esac
      continue
    fi

    case "${key}" in
      "") break ;;
      q|Q) exec 3>&-; echo "quit"; return ;;
      k|K) selected=$(( (selected - 1 + 2) % 2 )) ;;
      j|J) selected=$(( (selected + 1) % 2 )) ;;
    esac
  done

  if [ "${selected}" -eq 0 ]; then
    echo "source"
  else
    echo "docker"
  fi

  exec 3>&-
}

run_source() {
  cleanup_source() {
    [ -n "${DEV_PID:-}" ] && kill "${DEV_PID}" 2>/dev/null || true
    exit 0
  }
  trap cleanup_source INT TERM

  clear
  printf "%bStarting SOURCE mode...%b\n" "${C_GREEN}" "${C_RESET}"
  printf "%bDev:%b http://localhost:8011\n\n" "${C_BOLD}" "${C_RESET}"
  deno task dev &
  DEV_PID=$!
  sleep 2
  deno task bot
  kill "${DEV_PID}" 2>/dev/null || true
}

run_docker() {
  clear
  printf "%bStarting DOCKER mode...%b\n\n" "${C_BLUE}" "${C_RESET}"
  printf "%b[1/3]%b Rebuilding image\n" "${C_BLUE}" "${C_RESET}"
  docker compose build
  printf "%b[2/3]%b Stopping/removing current containers\n" "${C_BLUE}" "${C_RESET}"
  docker compose down
  printf "%b[3/3]%b Launching fresh containers (detached)\n" "${C_BLUE}" "${C_RESET}"
  docker compose up -d
  printf "\n%bDone:%b http://localhost:8011\n" "${C_CYAN}" "${C_RESET}"
}

MODE="$(choose_mode || true)"
cleanup_screen

MODE="$(printf "%s" "${MODE}" | tr -d '\r' | tr '[:upper:]' '[:lower:]')"

case "${MODE}" in
  source) run_source ;;
  docker) run_docker ;;
  *source*) run_source ;;
  *docker*) run_docker ;;
  quit) exit 0 ;;
  *) echo "Invalid mode selected."; exit 1 ;;
esac
