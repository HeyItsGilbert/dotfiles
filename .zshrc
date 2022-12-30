# Load custom bits
if [ -f ~/.bash_local ]; then
    . ~/.bash_local
fi
if [ -f ~/.shell/secret ]; then
    . ~/.shell/secret
fi
. ~/.shell/variables
. ~/.shell/functions
. ~/.shell/aliases

# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

# Set name of the theme to load.
ZSH_THEME="agnoster"

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
if [[ "$OSTYPE" == "linux-gnu" ]]; then
  plugins=(git emoji)
elif [[ "$unamestr" == "Darwin"* ]]; then
  plugins=(git osx battery emoji)
fi

source $ZSH/oh-my-zsh.sh
DEFAULT_USER=`whoami`

# Customize to your needs...
export PATH="$PATH:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/:~/bin:~/devtools/arcanist/bin:/Users/gsanchez/Downloads/android-sdk-macosx/platform-tools/:/Users/gsanchez/Downloads/android-sdk-macosx/tools:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"

#Functions
export CLICOLOR=1
export LSCOLORS=Hxgxfxfxcxdxdxhbadbxbx

# Automatic options added
setopt appendhistory autocd nomatch autopushd pushdignoredups promptsubst
unsetopt beep
bindkey -e
bindkey '^[[1;9C' forward-word
bindkey '^[[1;9D' backward-word
zstyle :compinstall filename '$HOME/.zshrc'
# end automatic options

# Make prompt prettier
autoload -U promptinit
promptinit
export LC_ALL=en_US.UTF-8
setopt PROMPT_SUBST
# TMOUT=1
# TRAPALRM() { zle reset-prompt }
strlen () {
    FOO=$1
    local zero='%([BSUbfksu]|([FB]|){*})'
    LEN=${#${(S%%)FOO//$~zero/}}
    echo $LEN
}

# show right prompt with date ONLY when command is executed
preexec () {
    DATE=$( date +"[%H:%M:%S]" )
    local len_right=$( strlen "$DATE" )
    len_right=$(( $len_right+1 ))
    local right_start=$(($COLUMNS - $len_right))

    local len_cmd=$( strlen "$@" )
    local len_prompt=$(strlen "$PROMPT" )
    local len_left=$(($len_cmd+$len_prompt))

    RDATE="\033[${right_start}C ${DATE}"

    if [ $len_left -lt $right_start ]; then
        # command does not overwrite right prompt
        # ok to move up one line
        echo -e "\033[1A${RDATE}"
    else
        echo -e "${RDATE}"
    fi

}
# Colorized Man Pages
man() {
  env \
    LESS_TERMCAP_mb=$(printf "\e[1;31m") \
    LESS_TERMCAP_md=$(printf "\e[1;31m") \
    LESS_TERMCAP_me=$(printf "\e[0m") \
    LESS_TERMCAP_se=$(printf "\e[0m") \
    LESS_TERMCAP_so=$(printf "\e[1;44;33m") \
    LESS_TERMCAP_ue=$(printf "\e[0m") \
    LESS_TERMCAP_us=$(printf "\e[1;32m") \
      man "$@"
}
export ITERM_ENABLE_SHELL_INTEGRATION_WITH_TMUX=1
test -e ${HOME}/.iterm2_shell_integration.zsh && source ${HOME}/.iterm2_shell_integration.zsh
eval "$(starship init zsh)"
