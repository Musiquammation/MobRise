/**
 * Content of the store images. Edit this file, not the templates.
 *
 * img:   raw capture, relative to dist/android-presentation/_raw ("phone/<scene>-<shot>.png").
 * pal:   background palette (blue red orange purple green yellow pink indigo teal sky lime).
 * title: headline, 2 lines (<br>), the punchy word in <b> (drawn yellow). Auto-shrinks to fit.
 * sub:   one short line under the title.
 * noads: adds the "No forced ads" pill (phone: noadsX / noadsY to move it).
 * size:  title font size (default 136) for longer titles.
 *
 * Order = upload order. Google Play shows the first 3 the most: put the
 * strongest hook first, then variety, then the "no forced ads" promise.
 * Play accepts 8 per device type: the phone extras (09+) are alternates.
 */

/** @type {[string, object][]} */
export const PHONE = [
	['01-grow-your-mob', { pal: 'blue', img: 'phone/gates-f.png', title: 'Grow a <b>massive</b><br>mob!', sub: 'Up to 400 runners charging at once', noads: true, noadsX: 300 }],
	['02-giant-bosses', { pal: 'red', img: 'phone/boss-d.png', title: 'Topple <b>giant</b><br>bosses', sub: 'Swarm them before the sword swings!' }],
	['03-pick-the-gate', { pal: 'orange', img: 'phone/gates-c.png', title: 'Pick the<br><b>right gate</b>', sub: '×3? +50? =400? Think fast!' }],
	['04-cannon-combo', { pal: 'yellow', img: 'phone/cannon-c.png', title: 'Fire your mob<br>from a <b>cannon</b>', sub: 'Chain hits on the ? boxes for big combos' }],
	['05-red-army', { pal: 'purple', img: 'phone/army-b.png', title: 'Crush the<br><b>red army</b>', sub: 'The bigger mob wins the clash' }],
	['06-saws-spikes', { pal: 'teal', img: 'phone/hazards-d.png', title: 'Dodge saws<br>&amp; <b>spikes</b>', sub: 'One swipe can save your whole crowd' }],
	['07-skins-powers', { pal: 'pink', img: 'phone/shop-b.png', title: 'Skins with<br><b>real powers</b>', sub: 'Flight • Shields • Speed • Coin boost' }],
	['08-no-forced-ads', { pal: 'green', img: 'phone/won-a.png', title: '<b>No</b> forced ads.<br>Just play!', sub: 'No ad wall between you and the next level', noads: true, noadsX: 300, noadsY: 1660 }],
	['09-right-power', { pal: 'indigo', img: 'phone/flight-d.png', title: 'Some levels need<br>the <b>right power</b>', sub: 'Wizards float over the void', size: 112 }],
	['10-arrows-wind', { pal: 'sky', img: 'phone/wind-c.png', title: 'Arrows. Wind.<br><b>Chaos!</b>', sub: 'Steer against the fans, dodge the volleys' }],
	['11-leap-the-void', { pal: 'orange', img: 'phone/jump-c.png', title: 'Leap over<br>the <b>void</b>', sub: 'Speed strips + jump pads = huge jumps' }],
	['12-recruit-runners', { pal: 'lime', img: 'phone/recruits-f.png', title: 'Recruit<br><b>lost runners</b>', sub: 'Every gray runner you touch joins you' }],
	['13-new-twist', { pal: 'blue', img: 'phone/levels-a.png', title: 'A <b>new twist</b><br>every level', sub: 'Replay any level you have beaten' }],
];

/** Rendered twice: tablet-7in (1920x1080) and tablet-10in (2560x1440). */
export const TABLET = [
	['01-grow-your-mob', { pal: 'blue', img: 'tablet/gates-f.png', title: 'Grow a<br><b>massive</b> mob!', sub: 'Up to 400 runners charging at once', noads: true }],
	['02-giant-bosses', { pal: 'red', img: 'tablet/boss-d.png', title: 'Topple<br><b>giant</b> bosses', sub: 'Swarm them before the sword swings!' }],
	['03-pick-the-gate', { pal: 'orange', img: 'tablet/gates-c.png', title: 'Pick the<br><b>right gate</b>', sub: '×3? +50? =400? Think fast!' }],
	['04-cannon-combo', { pal: 'yellow', img: 'tablet/cannon-c.png', title: 'Fire your mob<br>from a <b>cannon</b>', sub: 'Chain hits on the ? boxes for big combos' }],
	['05-red-army', { pal: 'purple', img: 'tablet/army-b.png', title: 'Crush the<br><b>red army</b>', sub: 'The bigger mob wins the clash' }],
	['06-arrows-wind', { pal: 'sky', img: 'tablet/wind-c.png', title: 'Arrows. Wind.<br><b>Chaos!</b>', sub: 'Steer against the fans, dodge the volleys' }],
	['07-skins-powers', { pal: 'pink', img: 'tablet/shop-b.png', title: 'Skins with<br><b>real powers</b>', sub: 'Flight • Shields • Speed • Coin boost' }],
	['08-no-forced-ads', { pal: 'green', img: 'tablet/won-a.png', title: '<b>No</b> forced ads.<br>Just play!', sub: 'No ad wall between you and the next level', noads: true }],
];

/** Feature graphic (1024x500): logo + tagline on the left, 3 fanned phones on the right. */
export const FEATURE = {
	left: 'phone/boss-d.png',
	center: 'phone/gates-f.png',
	right: 'phone/cannon-c.png',
	tagline: 'Grow your mob.<br><span style="color:#ffd23f">Crush the bosses!</span>',
};
