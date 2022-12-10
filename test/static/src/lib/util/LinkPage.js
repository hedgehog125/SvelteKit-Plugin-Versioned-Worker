import { base } from "$app/paths";

const linkPage = href => {
    if (href[href.length - 1] == "/") href = href.slice(0, href.length - 1);

    return base + "/" + href;
};
export default linkPage;