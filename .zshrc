# Load custom bits
. ~/.shell/variables
. ~/.shell/aliases
. ~/.shell/functions
if [ -f ~/.bash_local ]; then
    . ~/.bash_local
fi
if [ -f ~/.shell/secret ]; then
    . ~/.shell/secret
fi

# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

# Set name of the theme to load.
ZSH_THEME="agnoster"

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
if [[ "$OSTYPE" == "linux-gnu" ]]; then
  plugins=(git)
elif [[ "$unamestr" == "Darwin"* ]]; then
  plugins=(git osx)
fi

source $ZSH/oh-my-zsh.sh
DEFAULT_USER=`whoami`

# Customize to your needs...
export PATH=$PATH:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/:~/bin

#Functions
export CLICOLOR=1
export LSCOLORS=Hxgxfxfxcxdxdxhbadbxbx

# Automatic options added
#setopt appendhistory autocd nomatch autopushd pushdignoredups promptsubst
#unsetopt beep
#bindkey -e
#zstyle :compinstall filename '$HOME/.zshrc'
# end automatic options

# Make prompt prettier
autoload -U promptinit
promptinit
export LC_ALL=en_US.UTF-8
