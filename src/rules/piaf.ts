/**
 * What a swell paper (microcapsule) fuser such as PIAF needs from the file.
 * Each line is taken from a vendor or user guide. The export follows the
 * first three. The last three are for the person at the printer.
 */
export interface PrintRequirement {
  text: string
  source: string
  url: string
  /** True when the exported file itself meets this. */
  inFile: boolean
}

export const PIAF_REQUIREMENTS: readonly PrintRequirement[] = [
  {
    text: 'Black only. "Printed images must be in black ink to be made tactile. Colour does not normally work."',
    source: 'Sight and Sound Technology, PIAF guidance on Zychem swell paper',
    url: 'https://sastltd.zohodesk.eu/portal/en/kb/articles/piaf-guidance-on-using-zychem-swell-paper-to-make-tactile-documents-25-9-2024',
    inFile: true,
  },
  {
    text: 'No print text on the page. Every black mark rises, so the file holds only lines and braille dots.',
    source: 'BANA 2022, 4.3.2: the fuser "raises the gray and black areas on microcapsule paper"',
    url: 'https://www.brailleauthority.org/sites/default/files/tg/Tactile%20Graphics%20Standards%20and%20Guidelines%202022.pdf',
    inFile: true,
  },
  {
    text: 'Right-reading, not mirrored, at 100 percent scale. No guide we read asks for a mirrored image on swell paper.',
    source: 'BANA 2022, Appendix D.2 and D.3.1: a mirror image is named only for tooling on paper and foil',
    url: 'https://www.brailleauthority.org/sites/default/files/tg/Tactile%20Graphics%20Standards%20and%20Guidelines%202022.pdf',
    inFile: true,
  },
  {
    text: 'Use carbon-based toner or ink, or the image will not rise. Test your printer first.',
    source: 'BANA 2022, Appendix D.2',
    url: 'https://www.brailleauthority.org/sites/default/files/tg/Tactile%20Graphics%20Standards%20and%20Guidelines%202022.pdf',
    inFile: false,
  },
  {
    text: 'Print on the coated side: "add the capsule paper to the printer’s multipurpose tray white side up", then feed it into the fuser "image side up".',
    source: 'Anne Arundel Community College, Picture in a Flash (PIAF) guide',
    url: 'https://aacc.teamdynamix.com/TDClient/2439/Portal/KB/ArticleDet?ID=146333',
    inFile: false,
  },
  {
    text: '"Start with the lowest setting and work your way up until the image is sufficiently raised."',
    source: 'Anne Arundel Community College, Picture in a Flash (PIAF) guide',
    url: 'https://aacc.teamdynamix.com/TDClient/2439/Portal/KB/ArticleDet?ID=146333',
    inFile: false,
  },
]
