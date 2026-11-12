$ErrorActionPreference = 'Stop'
$root = 'C:\Users\Xerbi\OneDrive\Documents\Is401SemesterProject\groupgrubpicker'
$out = Join-Path $root 'output'
$build = Join-Path $root '.presentation-build'
New-Item -ItemType Directory -Force -Path $out, (Join-Path $build 'previews') | Out-Null
function Color($hex) { return [Convert]::ToInt32($hex.Substring(0,2),16) + 256*[Convert]::ToInt32($hex.Substring(2,2),16) + 65536*[Convert]::ToInt32($hex.Substring(4,2),16) }
$navy=Color '142B3B'; $cream=Color 'FAF7F0'; $teal=Color '126B68'; $muted=Color '52616B'; $gold=Color 'E4B76A'
$app = New-Object -ComObject PowerPoint.Application
$deck = $app.Presentations.Add(0)
$deck.PageSetup.SlideWidth=960
$deck.PageSetup.SlideHeight=540
function Text($slide,$value,$x,$y,$w,$h,$size,$color,$bold=$false) {
  $s=$slide.Shapes.AddTextbox(1,$x,$y,$w,$h)
  $s.TextFrame.MarginLeft=0; $s.TextFrame.MarginRight=0; $s.TextFrame.MarginTop=0; $s.TextFrame.MarginBottom=0
  $s.TextFrame.WordWrap=-1
  $s.TextFrame.TextRange.Text=$value
  $s.TextFrame.TextRange.Font.Name='Aptos'
  $s.TextFrame.TextRange.Font.Size=$size
  $s.TextFrame.TextRange.Font.Color.RGB=$color
  $s.TextFrame.TextRange.Font.Bold=[int]($bold)*-1
  $s.TextFrame.TextRange.ParagraphFormat.SpaceAfter=10
  return $s
}
function Slide($section,$title,$source='',$dark=$false) {
  $s=$deck.Slides.Add($deck.Slides.Count+1,12)
  $s.FollowMasterBackground=0; $s.Background.Fill.Solid()
  $fg=$navy; $label=$teal
  if($dark){$s.Background.Fill.ForeColor.RGB=$navy;$fg=$cream;$label=$gold}else{$s.Background.Fill.ForeColor.RGB=$cream}
  $null=Text $s $section 54 28 850 25 13 $label $true
  $null=Text $s $title 54 75 850 100 34 $fg $true
  $null=Text $s $source 54 490 805 34 10 $(if($dark){$cream}else{$muted})
  $null=Text $s ('{0:00}' -f $deck.Slides.Count) 867 494 40 22 12 $label
  return $s
}
function Pair($s,$lhead,$lbody,$rhead,$rbody) {
  $null=Text $s $lhead 54 195 395 32 16 $teal $true
  $null=Text $s $lbody 54 238 395 230 22 $navy
  $null=Text $s $rhead 510 195 395 32 16 $teal $true
  $null=Text $s $rbody 510 238 395 230 22 $navy
}
$s=Slide 'IS 403 / READING REFLECTION' 'How I want to work with people' '' $true
$null=Text $s 'Three principles from Dale Carnegie''s`nHow to Win Friends and Influence People'.Replace('`n',"`r") 54 200 820 95 27 $cream
$null=Text $s "Respecting opinions`rOwning my mistakes`rGiving sincere appreciation" 54 325 820 135 25 $gold

$s=Slide '01 / RESPECTING OPINIONS' 'Respect during disagreement' 'Book: Part III, chapter 2. Principle wording verified against Dale Carnegie Training, Culture.'
Pair $s 'CARNEGIE''S PRINCIPLE' 'Show respect for the other person''s opinions. Never say, “You are wrong.”' 'WHAT IT MEANS TO ME' 'Understand someone''s reasoning before challenging a conclusion. A blunt verdict can make a disagreement feel like an attack on the person.'

$s=Slide '01 / INFORMATION SYSTEMS APPLICATION' 'A disagreement about database design' 'Hypothetical IS scenario. Application of Carnegie, Part III, chapter 2.'
Pair $s 'THE SITUATION' 'A teammate wants one large table to simplify reporting. I favor related tables to avoid inconsistent updates. Calling their idea wrong could shut down discussion.' 'A BETTER RESPONSE' '“What reports would this make easier? Could we compare both designs with sample updates?” We test the tradeoffs together and document a decision based on evidence.'

$s=Slide '01 / GOSPEL CONNECTION + PERSONAL REFLECTION' 'Respect gives feedback a better chance' 'Journal connection: IS 403 Notes, entry 4-2. Scripture: Doctrine and Covenants 121:41–42 (paraphrased).'
Pair $s 'PERSONAL TAKEAWAY' 'My notes describe a roommate flatly telling me I was wrong about an engineering project. That felt discouraging. I want my technical feedback to leave room for the other person to explain.' 'GOSPEL + FUTURE ACTION' 'D&C 121 teaches influence through persuasion, gentleness, and sincere love. I can apply that ethic at work. In my next disagreement, I will ask two questions before proposing my alternative.'

$s=Slide '02 / OWNING MISTAKES' 'A prompt, clear admission of fault' 'Book: Part III, chapter 3. Principle verified against Dale Carnegie Training, Culture.'
Pair $s 'CARNEGIE''S PRINCIPLE' 'When I am wrong, I should admit it quickly and emphatically. I should name my error clearly instead of defending it or waiting for someone else to discover it.' 'WHAT IT MEANS TO ME' 'Owning the mistake lets the conversation focus on repair. A useful apology explains my responsibility and the next step. Trust still depends on what I do afterward.'

$s=Slide '02 / INFORMATION SYSTEMS APPLICATION' 'I promised a feature I had not verified' 'Hypothetical IS scenario adapted from the journal entry on admitting fault.'
Pair $s 'THE SITUATION' 'I tell a client a library supports a required feature. Later, I discover it does not. My assumption may increase development time and cost.' 'ACCOUNTABILITY + REPAIR' '“I gave you incorrect information. I should have verified it.” I notify the project lead and client promptly, compare a workaround with an alternative, and seek approval for any revised scope or schedule.'

$s=Slide '02 / GOSPEL CONNECTION + PERSONAL REFLECTION' 'Humility makes room for repair' 'Journal: IS 403 Notes, admitting-fault entry. Scripture: Doctrine and Covenants 58:43 (paraphrased).'
Pair $s 'PERSONAL TAKEAWAY' 'I wrote that I delayed admitting I was wrong when my wife and I discussed a fair division of chores. Protecting my ego delayed a useful conversation. I want to care more about a fair outcome than defending myself.' 'GOSPEL + FUTURE ACTION' 'D&C 58:43 connects repentance with confessing and forsaking sin. That pattern reminds me to acknowledge harm and change. When I recognize a mistake, I will name it promptly and commit to a concrete repair.'

$s=Slide '03 / SINCERE APPRECIATION' 'Recognition that helps people feel valued' 'Book: Part I, chapter 2. Related journal entries: 4-1 and 4-6.'
Pair $s 'CARNEGIE''S PRINCIPLE' 'Give honest and sincere appreciation. Recognize a real contribution and explain why it matters. Praise should reflect what I actually value about someone''s effort.' 'WHAT IT MEANS TO ME' 'Specific appreciation can strengthen a person''s desire to contribute. Connecting work to their own goals also helps motivation. I want my thanks to be meaningful without making it a bargaining tool.'

$s=Slide '03 / INFORMATION SYSTEMS APPLICATION' 'Appreciation during a code review' 'Hypothetical IS scenario adapted from IS 403 Notes, entries 4-1 and 4-6.'
Pair $s 'THE SITUATION' 'An intern improves form validation, but the submission flow still has a defect. I need to address the defect while recognizing the progress.' 'SPECIFIC APPRECIATION' '“Your validation messages explain how users can fix their input. Thank you for making that clearer.” Then we reproduce the remaining defect together. The intern knows what to keep doing and what needs work.'

$s=Slide '03 / GOSPEL CONNECTION + PERSONAL REFLECTION' 'Seeing the good before pointing out flaws' 'Journal: IS 403 Notes, entry 4-1. Scripture: Ephesians 4:29 (paraphrased).'
Pair $s 'PERSONAL TAKEAWAY' 'My notes describe criticizing a document my wife created before acknowledging how much she had done well. I needed to apologize. I want people close to me to know that I notice their contributions.' 'GOSPEL + FUTURE ACTION' 'Ephesians 4:29 teaches speech that builds others up. Honest appreciation puts that teaching into practice. This week I will thank one person each day for a specific contribution and explain its impact.'

$s=Slide 'MY COMMITMENT' 'The professional I want to become' 'Future application: personal commitments based on the reading journal.' $true
$null=Text $s 'When we disagree' 54 194 260 35 19 $gold $true
$null=Text $s 'I will understand the reasoning before challenging the conclusion.' 350 194 555 65 25 $cream
$null=Text $s 'When I make a mistake' 54 284 275 35 19 $gold $true
$null=Text $s 'I will acknowledge my responsibility and follow through on repair.' 350 284 555 65 25 $cream
$null=Text $s 'When others contribute' 54 374 275 35 19 $gold $true
$null=Text $s 'I will name what they did well and why it mattered.' 350 374 555 65 25 $cream

$s=Slide 'SOURCES' 'Reading and gospel references'
$refs=@(
 @('Dale Carnegie, How to Win Friends and Influence People','Part I, chapter 2. Part III, chapters 2–3. Chapter references avoid edition-specific page numbers.',''),
 @('IS 403 Notes, personal reading journal','Entries 4-1, 4-2, 4-6, and the entry on admitting fault.','https://docs.google.com/document/d/19fqWDDZ-UinuVdlVNkVql-o2PMoGOUU52VOf3vK5QYE/edit'),
 @('Dale Carnegie Training, Culture','Official summary of the principles.','https://www.dalecarnegie.com/en/culture'),
 @('Doctrine and Covenants 121:41–42','Persuasion, gentleness, and sincere love.','https://www.churchofjesuschrist.org/study/scriptures/dc-testament/dc/121?lang=eng&id=p41-p42'),
 @('Doctrine and Covenants 58:43','Confessing and forsaking sin.','https://www.churchofjesuschrist.org/study/scriptures/dc-testament/dc/58?lang=eng&id=p43'),
 @('Ephesians 4:29','Speech that builds others up.','https://www.churchofjesuschrist.org/study/scriptures/nt/eph/4?lang=eng&id=p29')
)
$y=173
foreach($ref in $refs){
 $t=Text $s $ref[0] 54 $y 850 29 19 $teal $true
 if($ref[2]){$t.TextFrame.TextRange.ActionSettings.Item(1).Hyperlink.Address=$ref[2]}
 $null=Text $s $ref[1] 54 ($y+27) 850 28 13 $muted
 $y+=51
}
$dest=Join-Path $out 'IS403_Carnegie_Reflection.pptx'
$deck.SaveAs($dest,24)
$deck.Export((Join-Path $build 'previews'),'PNG',1280,720)
$report=@()
foreach($slide in $deck.Slides){foreach($sh in $slide.Shapes){if($sh.HasTextFrame -and $sh.TextFrame.HasText){if($sh.TextFrame.TextRange.BoundHeight -gt $sh.Height+2){$report+="Overflow: slide $($slide.SlideIndex) $($sh.TextFrame.TextRange.Text)"}}}}
$report | Set-Content (Join-Path $build 'fit-report.txt')
$deck.Close()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($deck) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
Write-Output "Created $dest"
Write-Output "Text overflow findings: $($report.Count)"
