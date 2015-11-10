#!/bin/bash

array_contains() {
  # $1 is needle
  # #2+ is haystack
  # array_contains "needle" "${haystack[@]}"
  local e
  for e in "${@:2}"; do [[ "$e" == "$1" ]] && return 0; done
  return 1
}

_gerrit_assign() {
  local current_names="$@"
  local matched_names=( $(compgen -W "$(git config --get-all gerrit.reviewers)" -- $cur) )

  COMPREPLY=()

  for name in "${matched_names[@]}"; do

    if ! array_contains $name ${current_names[@]}; then
      COMPREPLY+=( "$name" )
    fi

  done
}

_gerrit_completion() {
    local cur prev opts

    COMPREPLY=()

    opts="help config projects clone patches pa status st up draft assign checkout co recheckout reco ssh review submit abandon comment ninja web completion topic"

    second="${COMP_WORDS[1]}"
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    if [[ $COMP_CWORD -eq 1 ]]; then

      COMPREPLY=( $(compgen -W "${opts}" -- $cur) )

    else

      case "${second}" in
        assign)
          _gerrit_assign "${COMP_WORDS[@]:2}"
          ;;
        up)
          if [[ ${COMP_WORDS[2]} = "--assign" ]]; then
            _gerrit_assign "${COMP_WORDS[@]:3}"
          elif [[ ${COMP_WORDS[3]} = "--assign" ]]; then
            _gerrit_assign "${COMP_WORDS[@]:4}"
          fi
          ;;
      esac

    fi

}

complete -F _gerrit_completion gerrit
complete -F _gerrit_completion ger
