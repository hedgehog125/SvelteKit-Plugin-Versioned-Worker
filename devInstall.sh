cd $(dirname $0) # The project folder
echo "Installing...
"

echo "== 1/3: Installing backend server dependencies ==
"
cd server
npm install

echo "
== 2/3: Installing static server dependencies ==
"
cd ../static
npm install

echo "
== 3/3: Installing gzip tool dependencies ==
"
cd ../tools
npm install

echo "
Installed.
"