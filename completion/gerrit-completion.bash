#!/bin/bash

__GERRIT_COMMANDS="help config projects clone patches status up draft assign checkout recheckout ssh review submit abandon comment ninja web completion topic squad team"

__gerrit_array_index() {
  # $1 is needle
  # #2+ is haystack
  # array_contains "needle" "${haystack[@]}"
  local i

  local needle="$1"

  shift

  for (( i=0; $# > 0; i++ )); do
    if [[ "$1" == "$needle" ]]; then
      echo "$i"
      return
    fi
    shift
  done

  echo -1
}

__gerrit_array_contains() {
  local index=$(__gerrit_array_index "$@")
  [[ "$index" -ne -1 ]]
}

__gerrit_get_reviewers() {
  git config --get-all gerrit.reviewers
}

__gerrit_get_squads() {
  git config --get-regex "^gerrit-squad\." | awk -F. '{print "@" $2}' | uniq
}

__gerrit_get_assign_list() {

  local all_names="$(__gerrit_get_reviewers)"

  local all_squads="$(__gerrit_get_squads)"

  local name_list=()

  for name in $all_names $all_squads; do

    if ! __gerrit_array_contains "$name" "${COMP_WORDS[@]}"; then
      name_list+=( "$name" )
    fi

  done

  echo "${name_list[@]}"
}

__gerrit_find_command() {

    local word

    for word in "${COMP_WORDS[@]}"; do

      if __gerrit_array_contains "$word" $__GERRIT_COMMANDS; then
        echo "$word"
        return 0
      fi

    done

    return 1

}

__gerrit_completion() {

    local word_list

    local squad_commands="list set add remove delete rename"

    local current_word="$2"

    local previous_word="$3"

    local current_command="$(__gerrit_find_command)"

    case "$current_command" in

      "")
        word_list="$__GERRIT_COMMANDS"
        ;;

      squad|team)
        if [[ "$previous_word" =~ ^(squad|team)$ ]]; then
          word_list="$squad_commands"
        elif __gerrit_array_contains "$previous_word" $squad_commands; then
          word_list="$(__gerrit_get_squads)"
        fi
        ;;

      assign)
        word_list="$(__gerrit_get_assign_list)"
        ;;

      help)
        if [[ "$previous_word" = "help" ]]; then
          word_list="$__GERRIT_COMMANDS"
        fi
        ;;

      up|draft)
        if __gerrit_array_contains "--assign" "${COMP_WORDS[@]:0:$COMP_CWORD}"; then
          word_list="$(__gerrit_get_assign_list)"
        fi
        ;;

    esac

    COMPREPLY=( $(compgen -W "$word_list" -- "$current_word") )

}

complete -F __gerrit_completion gerrit ger
