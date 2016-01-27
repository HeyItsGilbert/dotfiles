# Install oh-my-zsh
curl -L https://raw.github.com/robbyrussell/oh-my-zsh/master/tools/install.sh | sh
# Setup VIM
mkdir -p ~/.vim/swaps
mkdir -p ~/.vim/autoload ~/.vim/bundle && \
curl -LSso ~/.vim/autoload/pathogen.vim https://tpo.pe/pathogen.vim
# VIM Plugins
cd ~/.vim/bundle
git clone git://github.com/Lokaltog/vim-powerline.git
git clone https://github.com/bling/vim-airline ~/.vim/bundle/vim-airline
git clone https://github.com/kien/ctrlp.vim.git
git clone git://github.com/altercation/vim-colors-solarized.git
