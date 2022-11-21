cd $(dirname $0) # The project folder
echo "Installing for production...
"

cd server
npm install --production

echo "
Installed.
"