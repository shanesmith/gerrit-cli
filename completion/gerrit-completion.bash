#!/bin/bash

__GERRIT_COMMANDS="help config projects clone patches status up draft assign checkout recheckout ssh review submit abandon comment ninja web completion topic squad team add-remote install-hook"

__GERRIT_ALIASES="pa patch st co reco tp"

__GERRIT_SQUAD_COMMANDS="list set add remove delete rename"


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

__gerrit_get_options() {
  case "$1" in
    config)                 echo "--all --edit" ;;
    projects)               echo "--config" ;;
    clone)                  echo "--config --no-hook" ;;
    add-remote)             echo "--config --no-hook" ;;
    patches|pa)             echo "--number --not-number --owner --not-owner --author --not-author --reviewer --not-reviewer --branch --not-branch --topic --not-topic --message --not-message --age --not-age --drafts --not-drafts --starred --not-starred --watched --not-watched --reviewed --not-reviewed --assigned --not-assigned --mine --not-mine --remote --table --vertical --oneline --format" ;;
    assign)                 echo "--all --interactive --remote"  ;;
    up)                     echo "--remote --branch --draft --comment --assign" ;;
    draft)                  echo "--remote --branch --comment --assign" ;;
    checkout|co)            echo "--remote" ;;
    recheckout|reco)        echo "--remote" ;;
    ssh)                    echo "--remote" ;;
    review)                 echo "--interactive --remote" ;;
    submit|abandon|comment) echo "--all --interactive --remote" ;;
    ninja|pubmit)           echo "--all --remote --branch" ;;
    web)                    echo "--remote" ;;
  esac
}

__gerrit_unalias() {
  case "$1" in
    pa|patch) echo "patches" ;;
    st)       echo "status" ;;
    co)       echo "checkout" ;;
    reco)     echo "recheckout" ;;
    tp)       echo "topic" ;;
    *)        echo "$1"
  esac
}

__gerrit_get_squads() {
  git config --get-regex "^gerrit-squad\." | awk -F. '{print "@" $2}' | uniq
}

__gerrit_get_remotes() {
  git remote
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

      if __gerrit_array_contains "$word" $__GERRIT_COMMANDS $__GERRIT_ALIASES; then
        echo "$(__gerrit_unalias $word)"
        return 0
      fi

    done

    return 1

}

__gerrit_completion() {

    local word_list

    local current_word="$2"

    local previous_word="$3"

    local current_command="$(__gerrit_find_command)"

    if [[ "$current_word" =~ ^-- ]]; then

      word_list="$(__gerrit_get_options "$current_command")"

    elif [[ "$previous_word" = "--remote" ]]; then

      word_list="$(__gerrit_get_remotes)"

    else

      case "$current_command" in

        "")
          word_list="$__GERRIT_COMMANDS"
          ;;

        squad|team)
          if [[ "$previous_word" =~ ^(squad|team)$ ]]; then
            word_list="$__GERRIT_SQUAD_COMMANDS"
          elif __gerrit_array_contains "$previous_word" $__GERRIT_SQUAD_COMMANDS; then
            WORD_LIST="$(__gerrit_get_squads)"
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

    fi

    COMPREPLY=( $(compgen -W "$word_list" -- "$current_word") )

}

complete -F __gerrit_completion gerrit ger
