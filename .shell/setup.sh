# Install oh-my-zsh
curl -L https://raw.github.com/robbyrussell/oh-my-zsh/master/tools/install.sh | sh
# Setup VIM
mkdir -p ~/.vim/swaps
mkdir -p ~/.vim/autoload ~/.vim/bundle && \
curl -LSso ~/.vim/autoload/pathogen.vim https://tpo.pe/pathogen.vim
# VIM Plugins
cd ~/.vim/bundle
# git clone https://github.com/Lokaltog/vim-powerline.git
git clone https://github.com/bling/vim-airline
git clone https://github.com/vim-airline/vim-airline-themes
git clone https://github.com/kien/ctrlp.vim.git
git clone https://github.com/altercation/vim-colors-solarized.git
git clone https://github.com/PProvost/vim-ps1.git
