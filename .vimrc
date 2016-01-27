" Welcome to my vimrc!

" Basic setup {{{

"Automatic reloading of .vimrc
"autocmd! bufwritepost .vimrc source %

"vim: foldmethod=marker

set nocompatible
filetype off
" Load other plugins
"runtime bundle/pathogen/autoload/pathogen.vim
execute pathogen#infect()
call pathogen#helptags()
" Set up filetype
syntax on
filetype plugin indent on
"let g:pydiction_location = '~/.vim/bundle/pydiction/complete-dict'
syntax enable
set runtimepath^=~/.vim/bundle/ctrlp.vim

" }}}

" Plugin stuff {{{

" Read man pages with :Man
runtime ftplugin/man.vim

" Settings for powerline
let s:uname = system("uname -s")
if s:uname == "Darwin"
  " Do Mac stuff here
  python from powerline.vim import setup as powerline_setup
  python powerline_setup()
  python del powerline_setup
endif
set laststatus=2


" }}}

" Core behavioral settings {{{

" Backup files are annoying
set nobackup

set directory=~/.vim/swaps//

" This means a buffer will still be loaded even if it isn't displayed. Use :ls
" and :bd to manage
set hidden

" smartcase is case-sensitive iff your search includes a capital letter
set ignorecase smartcase incsearch hlsearch

" Use the tab-completion (for files) that I'm used to in bash.
set wildmode=list:longest

" allow backspacing over everything in insert mode
set backspace=indent,eol,start

" Tabs are 4 spaces wide, but we use spaces instead. shiftwidth is for
" autoindent, softtabstop is for when I press tab
set tabstop=4 expandtab shiftwidth=2 softtabstop=2

" In general, 80col
set textwidth=80

" }}}

" Core display settings {{{

if version >= 703
  " I like this, some people prefer set number
  set number
end

" I like to know what file I'm editing even when I'm only editing one.
set laststatus=2

" Display the caret position at bottom of screen
set ruler

set cursorline

" Shows the partial command in the last line
set showcmd

if version >= 703
  " Display a line at the 81st column
  set colorcolumn=+1
end

" Highlight tab literals and trailing spaces
set list listchars=tab:\ \ ,trail:\

" }}}

" Pretty display settings (colors, GUI) {{{

" Main color settings
set guifont=Anonymous_Pro:h11
set background=dark
colors solarized

" e: tab bar; g: show disabled menu items gray; m: use menubar
set guioptions=egm

if has("gui_macvim")
  " Transparency rocks, but only in small quantities
  set transparency=2
  " Fullscreen fills entire screen, retains transparency setting
  set fuopt+=maxhorz,background:Normal
endif

augroup initial_winsize " {{{
  au!
  " Initial window size. 171 is just wide enough for 2 vertical splits of 80
  " columns plus chrome. 999 is quite tall.
  au GUIEnter * :set columns=171 lines=999
augroup END " }}}

" }}}

" Input settings {{{

" Use , as a custom leader key.
let mapleader=","

" Enable the mouse in normal mode
set mouse=n

"hide mouse while typing
set mousehide

" I was accidentally pasting too much
map <MiddleMouse> <Nop>

" Select mode is for Notepad users.
set selectmode=

" F2 will switch to paste mode, which will disable auto-indent, among other
" things.
set pastetoggle=<F2>

" }}}

" Key bindings (noremaps) {{{

" Unbind arrow keys to force yourself to break that habit when you are just
" getting started.
noremap <Left> <Nop>
noremap <Right> <Nop>
noremap <Up> <Nop>
noremap <Down> <Nop>
inoremap <Left> <Nop>
inoremap <Right> <Nop>
inoremap <Up> <Nop>
inoremap <Down> <Nop>

" Enter command mode by pressing ; instead of :
noremap ; :

" I don't really use space, and have , and ; remapped
noremap <Space> ;
noremap <S-Space> ,

" Exit insert mode by typing jk. Trust me, you never need to type jk.
inoremap jk <Esc>

" Love me some emacs-style shortcuts
inoremap <C-a> <Esc>I
inoremap <C-e> <Esc>A
inoremap <C-d> <Delete>
cnoremap <C-a> <Home>
cnoremap <C-e> <End>
cnoremap <C-d> <Delete>

" Window nav
noremap <C-h> <C-w>h
noremap <C-j> <C-w>j
noremap <C-k> <C-w>k
noremap <C-l> <C-w>l

" Arrow keys scroll view in normal mode
noremap <Up> <C-y>
noremap <Down> <C-e>

" jk should scroll by actual lines
nnoremap <silent> j gj
nnoremap <silent> k gk

" Use %% in command mode to get the directory of the current file.
cnoremap %% <C-R>=expand('%:h').'/'<cr>

" Quicksave command
noremap <Leader>w :update<CR>
vnoremap <Leader>w <C-C>:update<CR>
inoremap <Leader>w <C-O>:update<CR>


" }}}

" Shortcuts (maps) {{{

" Toggle fullscreen mode on command-enter
nmap <silent> <D-CR> :set fullscreen!<CR>

" Q normally switches to ex mode, but I don't use that
map Q gq

" ,/ will turn off search highlighting until you search again.
nmap <silent> <leader>/ :nohlsearch<CR>

" FSwitch
nmap <leader>s :FSHere<CR>

" Ggrep (fugitive) current word
map <leader>G :Ggrep '<C-r><C-w>'<CR>

" "Fold tag", useful for XML/HTML
nnoremap <leader>ft Vatzf

nmap <C-B> :CtrlPBuffer<CR>

" Moving Between Tabs
map <Leader>n <esc>:tabprevious<CR>
map <Leader>m <esc>:tabnext<CR>
vnoremap <Leader>s :sort<CR>


" easier moving of code blocks, better indention
vnoremap < <gv
vnoremap > >gv


" Split the buffer or window left, right, up, or down
nmap <leader>sh  :leftabove  vnew<CR>
nmap <leader>sj  :rightbelow new<CR>
nmap <leader>sk  :leftabove  new<CR>
nmap <leader>sl  :rightbelow vnew<CR>
nmap <leader>swh :topleft    vnew<CR>
nmap <leader>swj :botright   new<CR>
nmap <leader>swk :topleft    new<CR>
nmap <leader>swl :botright   vnew<CR>


" Awesome line number magic
function! NumberToggle()
  if(&relativenumber == 1)
    set number
  else
    set relativenumber
  endif
endfunc

nnoremap <Leader>l :call NumberToggle()<CR>
":au FocusLost * set number
":au FocusGained * set relativenumber
"autocmd InsertEnter * set number
"autocmd InsertLeave * set relativenumber
set number

" Settings for ctrlp
" " cd ~/.vim/bundle
" " git clone https://github.com/kien/ctrlp.vim.git
let g:ctrlp_max_height = 30
set wildignore+=*.pyc
" set wildignore+=*_build/*
" set wildignore+=*/coverage/*


" Settings for python-mode
" cd ~/.vim/bundle
" git clone https://github.com/klen/python-mode
"map <Leader>g :call RopeGotoDefinition()<CR>
"let ropevim_enable_shortcuts = 1
"let g:pymode_rope_goto_def_newwin = "vnew"
"let g:pymode_rope_extended_complete = 1
let g:pymode_breakpoint = 0
let g:pymode_syntax = 1
let g:pymode_syntax_builtin_objs = 0
let g:pymode_syntax_builtin_funcs = 0
"map <Leader>b Oimport ipdb; ipdb.set_trace() # BREAKPOINT<C-c>
"let g:pymode_rope_completion_bind = '<C-a>'


" Settings for jedi-vim
" cd ~/.vim/bundle
"git clone git://github.com/davidhalter/jedi-vim.git
map <Leader>b Oimport ipdb; ipdb.set_trace() # BREAKPOINT<C-c>
map <leader>g :call goto_assignments()<CR>
let g:jedi#usages_command = "<leader>n"
"let g:jedi#popup_on_dot = 0
let g:jedi#popup_select_first = 0
let g:jedi#use_tabs_not_buffers = 0
let g:jedi#use_splits_not_buffers = "top"
let g:jedi#completions_command = "<C-a>"


" Better navigating through omnicomplete option list
" See http://stackoverflow.com/questions/2170023/how-to-map-keys-for-popup-menu-in-vim
set completeopt=longest,menuone
function! OmniPopup(action)
    if pumvisible()
        if a:action == 'j'
            return "\<C-N>"
        elseif a:action == 'k'
            return "\<C-P>"
        endif
    endif
    return a:action
endfunction

inoremap <silent><C-j> <C-R>=OmniPopup('j')<CR>
inoremap <silent><C-k> <C-R>=OmniPopup('k')<CR>


" Python folding
" mkdir -p ~/.vim/ftplugin
" wget -O ~/.vim/ftplugin/python_editing.vim http://www.vim.org/scripts/download_script.php?src_id=5492
set nofoldenable


" }}}

" Custom commands {{{

" Convenient command to see the difference between the current buffer and the
" file it was loaded from, thus the changes you made.
command! DiffOrig vert new | set bt=nofile | r # | 0d_ | diffthis
        \ | wincmd p | diffthis

" This doesn't work right....
if &term == "screen" || &term == "xterm"
  if &term == "screen"
    set t_ts=k
    set t_fs=\
  endif
  set title
  let &titlestring = "vim " . pathshorten(expand("%:~:.:f"))
  au BufEnter * let &titlestring = "vim " . pathshorten(expand("%:~:.:f"))
endif

" Resize my window to fit N columns of 81 columns with 4 gutter columns each
" plus (n - 1) separator bars, and be max height
function! SetCols(n)
  let cols = a:n * 86 - 1
  exec "set columns=" . cols . " lines=999"
endfunction
command! -count=1 Cols call SetCols(<count>)

augroup insert_trailingspace " {{{
  au!

  " Remove trailing spaces when leaving insert mode
  au InsertLeave * '[,']s/\s\+$//e|normal `^
augroup END " }}}

augroup jump_to_last_pos " {{{
  au!
  " When editing a file, always jump to the last known cursor position.
  " Don't do it when the position is invalid or when inside an event handler
  " (happens when dropping a file on gvim).
  " Also don't do it when the mark is in the first line, that is the default
  " position when opening a file.
  autocmd BufReadPost *
    \ if line("'\"") > 1 && line("'\"") <= line("$") |
    \   exe "normal! g`\"" |
    \ endif
augroup END " }}}

" }}}

" File type-specific {{{

augroup ft_phpt " {{{
  au!

  " phpt files are php files in disguise
  au BufNewFile,BufRead *.phpt setlocal filetype=php
augroup END " }}}

augroup ft_javascript " {{{
  au!

  " CommonJS modules omit the .js, so this allows gf to work
  au FileType javascript setlocal suffixesadd=.js
augroup END " }}}

augroup ft_text " {{{
  au!

  " For all text files set 'textwidth' to 78 characters.
  au FileType text setlocal textwidth=78
augroup END " }}}

augroup ft_cfolding " {{{
  au!

  au FileType javascript,java,c,php,css setlocal foldmethod=marker
  au FileType javascript,java,c,php,css setlocal foldmarker={,}
  au FileType javascript,java,c,php,css setlocal foldlevel=999
augroup END " }}}

augroup ft_python " {{{
  au!

  au FileType python setlocal sw=2 sts=2 ts=2
augroup END " }}}

" }}}

