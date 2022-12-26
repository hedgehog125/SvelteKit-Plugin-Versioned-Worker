import { base } from "$app/paths";

export function linkPage(href) {
    if (href[href.length - 1] == "/") href = href.slice(0, href.length - 1);

    return base + "/" + href;
};

export function formatTime(total, count = 3) {
	let hours = Math.floor(total / (60 * 60));
	total -= hours * (60 * 60);
	let minutes = Math.floor(total / 60);
	total -= minutes * 60;
	let seconds = total;

	let counts = [hours, minutes, seconds];
	counts.splice(0, counts.length - count);
	return counts.map(
		value => value.toString().padStart(2, "0")
	).join(":");
};