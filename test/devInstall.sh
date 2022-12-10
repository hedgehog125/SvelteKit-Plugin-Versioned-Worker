cd $(dirname $0) # The project folder
echo "Installing...
"

echo "
== 1/2: Installing static server dependencies ==
"
cd ../static
npm install

echo "
== 2/2: Installing gzip tool dependencies ==
"
cd ../tools
npm install

echo "
Installed.
"