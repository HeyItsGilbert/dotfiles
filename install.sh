#!/bin/bash

parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )

# Check for zsh
if [[ `which zsh &>/dev/null && $?` != 0 ]]
then
  echo "ZSH is not installed! Install it and try again."
fi

# Install oh-my-zsh
if [ -d ~/.oh-my-zsh ]; then
	echo "oh-my-zsh is installed"
else
  echo "Installing oh-my-zsh"
  curl -L https://raw.github.com/robbyrussell/oh-my-zsh/master/tools/install.sh | sh
fi

# Check for Tmux and Setup
if [[ `which tmux &>/dev/null && $?` != 0 ]]
then
  echo "Tmux is not installed! Install it and try again."
fi
# Setup TPM
if [ -d "~/.tmux/plugins/tpm" ]
then
  echo "TPM is already installed."
else
  echo "Installing TPM"
  git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
fi

# Setup VIM
mkdir -p ~/.vim/swaps ~/.vim/autoload ~/.vim/bundle
curl -LSso ~/.vim/autoload/pathogen.vim https://tpo.pe/pathogen.vim

# VIM Plugins
declare -A vimplugins
vimplugins=(
  ["bling/vim-airline"]="vim-airline"
  ["vim-airline/vim-airline-themes"]="vim-airline-themes"
  ["ctrlpvim/ctrlp.vim"]="ctrlp.vim"
  ["altercation/vim-colors-solarized.git"]="vim-colors-solarized"
  ["/PProvost/vim-ps1.git"]="vim-ps1"
)
for plugin in "${!vimplugins[@]}";
do
  echo "git clone https://github.com/$plugin - ${vimplugins[$sound]}"
done

# Install Chezmoi
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply $GITHUB_USERNAME