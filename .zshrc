# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

# Set name of the theme to load.
# Look in ~/.oh-my-zsh/themes/
# Optionally, if you set this to "random", it'll load a random theme each
# time that oh-my-zsh is loaded.
#ZSH_THEME="funky"
#ZSH_THEME="robbyrussell"
ZSH_THEME="agnoster"

# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"

# Set to this to use case-sensitive completion
# CASE_SENSITIVE="true"

# Uncomment this to disable bi-weekly auto-update checks
# DISABLE_AUTO_UPDATE="true"

# Uncomment to change how often before auto-updates occur? (in days)
# export UPDATE_ZSH_DAYS=13

# Uncomment following line if you want to disable colors in ls
# DISABLE_LS_COLORS="true"

# Uncomment following line if you want to disable autosetting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment following line if you want to disable command autocorrection
# DISABLE_CORRECTION="true"

# Uncomment following line if you want red dots to be displayed while waiting for completion
# COMPLETION_WAITING_DOTS="true"

# Uncomment following line if you want to disable marking untracked files under
# VCS as dirty. This makes repository status check for large repositories much,
# much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
plugins=(git osx)

source $ZSH/oh-my-zsh.sh
#source ~/.bash/config/git-completion.bash
DEFAULT_USER="gsanchez"

# Customize to your needs...
export PATH=$PATH:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/:~/bin

#Functions
export CLICOLOR=1
export LSCOLORS=Hxgxfxfxcxdxdxhbadbxbx
#export PS1="[\u@\h \w]\\$ "

# Automatic options added
setopt appendhistory autocd nomatch autopushd pushdignoredups promptsubst
unsetopt beep
bindkey -e
zstyle :compinstall filename '/home/gsanchez/.zshrc'
# end automatic options

# Make prompt prettier
autoload -U promptinit
promptinit

. ~/.shell/variables
. ~/.shell/aliases
#. ~/.shell/completions
. ~/.shell/functions
#. ~/.shell/prompt
#. ~/bin/virtualenvwrapper.sh
#. ~/.shell/host_specific
if [ -f ~/.bash_local ]; then
    . ~/.bash_local
fi

#export PATH="$PATH:$HOME/.rvm/bin" # Add RVM to PATH for scripting
