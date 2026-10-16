#!/usr/bin/env python3
"""Emit a ~4 day fake conversation between the six seed users as JSONL
for post.py. Usage: convo.py > /tmp/convo.jsonl"""
import json, random
from datetime import datetime, timedelta

S, B, W, M, T, K = "sean", "bananaman", "wombat", "moonlord", "toaster", "kebab"
random.seed(7)

# (day offset from first day, "HH:MM", [(user, text), ...], max gap seconds between lines)
scenes = [
(0, "08:12", 90, [
 (S, "morning all"), (T, "mornin"), (S, "did anyone get the staging deploy to go through last night?"),
 (K, "yeah it went through around midnight, i was up anyway"), (S, "ah thanks. i saw the green check but wanted a human to confirm"),
 (K, "human confirmed. mostly human"), (T, "lol"), (W, "what are we deploying"), (S, "the voice rework, it's finally behind a flag"),
 (W, "nice. i'll poke at it later"), (M, "is the flag on by default"), (S, "off. you have to set it in the env"),
 (M, "good. last time something was on by default i got 14 pings"), (B, "that was the pizza bot incident wasn't it"),
 (M, "do not speak of the pizza bot"), (B, "the pizza bot was a gift to this community"), (T, "the pizza bot ordered 40 pizzas"),
 (B, "and 40 pizzas were delivered. system worked"), (K, "to a building none of us work in"), (B, "details"),
]),
(0, "10:40", 150, [
 (W, "ok question. anyone using sqlite WAL mode with more than one writer process"),
 (S, "in prod? no. we have one writer"), (W, "i keep reading conflicting things about busy_timeout"),
 (S, "set it to 5000 and move on, it's fine for our scale"), (W, "that's the answer i wanted but not the one i expected"),
 (M, "the real answer is it's fine until it isn't"), (W, "very helpful moonlord"), (M, "i contain multitudes"),
 (K, "wal files growing forever is the thing to watch"), (W, "checkpoint on a timer?"), (K, "the default auto checkpoint is ok unless you have a long reader"),
 (W, "i have a long reader. it's a metrics script"), (K, "there it is"), (W, "ok i'll make it read in smaller chunks"),
 (T, "or just copy the db and read the copy"), (W, "that's also not a bad idea"), (S, "don't copy a live wal db with cp tho"),
 (T, "use .backup, yeah yeah"), (S, "just saying"),
]),
(0, "12:55", 120, [
 (B, "lunch plans"), (T, "leftover curry"), (K, "kebab. obviously"), (K, "don't say it"), (B, "i wasn't going to say it"),
 (M, "kebab is having a kebab"), (K, "i knew it"), (W, "i'm having a sad desk salad"), (S, "what's sad about it"),
 (W, "no dressing. i forgot"), (S, "oh that's rough"), (B, "i'll trade you half a sandwich for a story"),
 (W, "ok so my landlord's cat has started sleeping on my car"), (B, "that's not a story that's a situation"),
 (W, "every morning there's a cat on the hood. i have to move it to leave. it looks at me like i'm the problem"),
 (T, "you are the problem. it's his hood"), (W, "it is NOT his hood"), (K, "name the cat"), (W, "cabbage"), (M, "cabbage is a great name"),
 (B, "deal. half a sandwich incoming"),
]),
(0, "15:30", 200, [
 (T, "anyone know why the sidebar flickers when i switch channels"), (S, "which browser"), (T, "firefox"),
 (S, "huh. i'll check. is it every time"), (T, "only the first switch after a reload"), (S, "that smells like the fonts"),
 (T, "ha could be. there's a flash of a different font"), (S, "yeah ok font-display. i'll fix that"),
 (M, "can we also make the channel list collapsible on mobile"), (S, "it is already?"), (M, "not for me. there's no arrow"),
 (S, "which phone"), (M, "an old pixel"), (S, "ok i believe you. screenshot?"), (M, "will send when i'm home"),
 (K, "can't wait to see the old pixel"), (M, "it has character"),
]),
(0, "19:20", 100, [
 (B, "evening"), (K, "hey"), (B, "anyone want to play something tonight"), (T, "what"), (B, "something with no loading screens"),
 (M, "that's not a genre"), (B, "it should be"), (W, "chess"), (B, "that's a loading screen with extra steps"),
 (W, "what"), (K, "i'm in for anything. but not before 9, i'm cooking"), (T, "9 works"), (S, "i'm in if it's co-op"),
 (B, "co-op it is. i'll find something"), (M, "please not the one with the rakes"), (B, "the rake game is a classic"),
 (M, "i stepped on 31 rakes last time"), (B, "and you had fun"), (M, "...a little"),
 (S, "jump in voice at 9?"), (T, "👍"), (K, "👍"), (W, "👍"),
]),
(0, "23:10", 240, [
 (S, "that was fun"), (T, "moonlord stepped on every single rake"), (M, "I REGRET NOTHING"), (K, "the way you screamed"),
 (M, "it was a strategic scream"), (B, "same time tomorrow?"), (S, "maybe. i've got the voice stuff to finish"),
 (W, "gn all"), (T, "night"), (K, "night"),
]),
(1, "08:45", 110, [
 (K, "ok who changed the favicon"), (S, "that was me. too much?"), (K, "no it's cute. it looks like a headset"),
 (S, "it's a headset"), (K, "i know i just wanted you to feel seen"), (S, "thank you"),
 (T, "morning btw"), (B, "mornin"), (T, "bananaman you were up late"), (B, "i found a second game and lost track of time"),
 (M, "the rake game?"), (B, "a different game. there were fewer rakes and more tractors"),
 (M, "that's a better game"), (B, "it's the same game"), (W, "morning folks"),
 (W, "cabbage update: cabbage has moved to the porch. my car is free"), (T, "he knows you've been talking about him"),
 (W, "he's watching"), (K, "beware the cabbage"),
]),
(1, "10:05", 160, [
 (S, "ok voice rework status: calls connect, mute works, deafen is... complicated"), (W, "complicated how"),
 (S, "deafen mutes you AND stops remote audio, but if you undeafen it forgets you were muted"), (W, "yeah that's a bug"),
 (S, "right but is it a bug or is it a feature"), (W, "it's a bug sean"), (S, "ok fine"),
 (M, "discord has the same behavior as the thing you want. undeafen restores previous mute"), (S, "ok so store previous mute state"),
 (M, "yes"), (S, "easy"), (T, "famous last words"), (S, "it's four lines"), (T, "the four lines of doom"),
 (K, "can we get a push to talk option too"), (S, "put it in the issue tracker, i'll look after this"),
 (K, "there's an issue tracker?"), (S, "there's a markdown file"), (K, "oh"), (K, "i'll add it to the markdown file"),
 (S, "thank you"),
]),
(1, "12:30", 130, [
 (B, "reminder that the sandwich economy is booming"), (T, "what's the going rate"), (B, "one story per half sandwich"),
 (T, "i don't have a story"), (B, "everyone has a story"), (T, "my story is i make coffee and then drink it"),
 (B, "that's a haiku not a story"), (T, "that's a gift"), (K, "ok i have one. i found a 20 in a coat from last winter"),
 (B, "and"), (K, "and i bought a kebab with it"), (M, "so the kebab has now paid for the kebab"), (K, "full circle"),
 (W, "that's beautiful"), (S, "someone should write that down"), (K, "i have"),
]),
(1, "14:50", 180, [
 (M, "found something nasty in the log rotation"), (S, "what"), (M, "we rotate the logs but never prune. 6 months of logs"),
 (S, "oh no"), (M, "it's only 800mb"), (S, "that's not nothing on the small vps"), (M, "no it's not. i'll add a cron"),
 (W, "logrotate does that for you"), (M, "we're not using logrotate, it's a custom thing"), (W, "why"), (M, "i don't know, i inherited it"),
 (K, "from who"), (M, "from past me"), (K, "past you is a menace"), (M, "past me had a lot of energy and no plan"),
 (T, "i feel attacked on behalf of all past selves"), (M, "i'll just switch to logrotate"), (S, "please"), (M, "ok ok ok"),
 (W, "keep copytruncate off, it loses lines"), (M, "noted"),
]),
(1, "17:40", 90, [
 (T, "ok so i got a new keyboard"), (B, "pics"), (T, "it's loud"), (B, "pics"), (T, "it's SO loud"), (K, "how loud"),
 (T, "my neighbor knocked"), (K, "that loud"), (T, "i'm going to put o-rings in"), (W, "do that. we can hear it on voice"),
 (T, "you can?"), (W, "it sounds like rain"), (T, "that's... kind of nice?"), (W, "for 5 minutes"), (M, "it's hail by 6"),
 (T, "ok ok o-rings tonight"),
]),
(1, "21:00", 140, [
 (B, "tractor game?"), (K, "yes"), (M, "yes"), (S, "i'll hop on later, finishing something"), (W, "can't tonight, sorry"),
 (T, "i'm in, give me ten"), (B, "voice channel"), (M, "who's hosting"), (B, "me"), (M, "the host always crashes it"),
 (B, "that was ONE time"), (K, "it was two times"), (B, "ok two times"), (T, "i'm in"),
]),
(2, "09:10", 100, [
 (W, "morning. weird one: anyone else's messages show up out of order"), (S, "when"), (W, "yesterday i sent two close together and they flipped"),
 (S, "hm. they're ordered by id server side. maybe it was client side optimistic ordering"), (W, "could be"),
 (S, "do you remember the channel"), (W, "general"), (S, "i'll try to repro"), (T, "i've seen it too, once"), (T, "i thought i was dreaming"),
 (S, "ok now i'm worried"), (K, "i haven't seen it"), (M, "no"), (S, "ok. if someone catches it screenshot the timestamps"),
 (W, "will do"),
]),
(2, "10:30", 170, [
 (K, "random but what's everyone drinking"), (T, "coffee"), (B, "tea"), (M, "coffee, black, bitter, like my soul"),
 (W, "mate"), (S, "coffee but it's lukewarm because i got distracted"), (K, "you always do that"), (S, "i know"),
 (T, "there's a mug that heats itself"), (S, "that's the most dangerous thing you could tell me"), (T, "i have one"),
 (S, "what's it like"), (T, "it works for like an hour and then it's just a mug"), (S, "i'll take it"),
 (B, "mate is just tea with commitment"), (W, "mate is just mate"), (B, "the commitment is the gourd"), (W, "fine."),
 (W, "yes. fine."),
]),
(2, "13:15", 120, [
 (S, "pushed the deafen fix"), (W, "tested?"), (S, "tested on my machine"), (T, "the four words that ruin lives"),
 (S, "ok tested on two machines. mine and my laptop"), (T, "progress"), (M, "i'll pull it and try"), (M, "ok deafen works. undeafen restores mute"),
 (S, "yes!"), (M, "but if you leave the channel while deafened and rejoin you're still deafened"), (S, "..."), (S, "that's correct behavior"),
 (M, "is it"), (S, "it's an edge case. let me think about it"), (K, "discord resets on rejoin"), (S, "ok. then we reset on rejoin"),
 (S, "i'll fix it"), (T, "four more lines"), (S, "SIX more lines"),
]),
(2, "16:00", 200, [
 (K, "who wants to see my dumb project"), (B, "me"), (K, "it's a tiny bot that rates sandwiches"), (B, "WHAT"), (K, "you give it a photo, it gives you a score out of 10"),
 (B, "this is the greatest thing i've ever heard"), (K, "it's mostly random"), (B, "mostly?"), (K, "the score is based on how much of the photo is bread"),
 (M, "peak engineering"), (W, "does it rate kebabs"), (K, "it rates kebabs highly"), (T, "because it's biased"), (K, "because kebabs are great"),
 (B, "run my sandwich through it"), (K, "send a pic"), (B, "[image of a sandwich, trust me]"), (K, "7.4"), (B, "i'm insulted"),
 (K, "it's a harsh critic"), (B, "it's WRONG"), (M, "it's a machine bananaman, it can't be wrong"), (B, "everyone is against me today"),
]),
(2, "18:45", 130, [
 (T, "ok so i did the o-rings"), (W, "report"), (T, "it's now quiet. too quiet"), (K, "that's how horror movies start"),
 (T, "i miss the rain"), (W, "told you"), (T, "i'm taking one out"), (M, "you've created a mid-volume keyboard"), (T, "the goldilocks keyboard"),
 (S, "my neighbors would thank you"), (T, "your neighbors can't hear my keyboard sean"), (S, "they can hear everything"), (S, "i live in paper"),
]),
(2, "22:05", 160, [
 (M, "can't sleep"), (K, "same"), (M, "what are you doing"), (K, "watching a documentary about bridges"),
 (M, "good ones?"), (K, "the bridge in it collapsed. it's not a happy documentary"), (M, "why are you watching it to sleep"),
 (K, "it's soothing in a morbid way"), (M, "that's the most you thing"), (K, "thank you"), (W, "i'm awake too lol"),
 (W, "what's the plan"), (M, "no plan"), (W, "great plan"), (K, "all in favor of sleeping at midnight"), (M, "aye"), (W, "aye"), (K, "aye. motion carried. will not sleep"),
]),
(3, "08:30", 100, [
 (S, "morning. got the repro for the out of order thing"), (W, "oh?"), (S, "if two messages land in the same second the client sorts by timestamp then id"),
 (S, "but the sort isn't stable on the first render"), (W, "so that's a real bug"), (S, "yes. fixing"), (T, "so i wasn't dreaming"),
 (S, "you weren't dreaming"), (T, "vindicated"), (B, "good morning to everyone except the sort function"), (K, "lol"),
 (M, "sort functions are a gateway bug"), (S, "i'll add a test"), (T, "he said the t word"), (S, "i know. i'm growing"),
]),
(3, "09:50", 140, [
 (B, "ok i have a serious announcement"), (K, "uh oh"), (B, "i'm going to start a sourdough"), (M, "no"), (B, "yes"),
 (M, "you'll abandon it in a week"), (B, "i won't, i named it"), (T, "what is it named"), (B, "doughnald"), (T, "doughnald."),
 (W, "i can't believe it"), (B, "he's already bubbling"), (K, "it's been 20 minutes"), (B, "he's an overachiever"),
 (M, "when do i get bread"), (B, "in about a week"), (M, "that's when you abandon him"), (B, "i will not"), (K, "set a reminder to check on doughnald"),
 (B, "i did. it's named 'doughnald'"), (S, "i love this channel"),
]),
(3, "11:30", 180, [
 (W, "ok real work. who's reviewing my pr"), (S, "which one"), (W, "the metrics one. it's small"), (S, "'small' it has 60 files"),
 (W, "40 of them are generated"), (S, "then why are they in the pr"), (W, "because i forgot to gitignore them"), (S, "ugh"),
 (M, "i'll review it"), (W, "thank you moonlord"), (M, "i'll start with the real ones and ignore the rest"), (W, "that's what i'd do"),
 (S, "can you also gitignore the generated files"), (W, "yes yes yes. fixing"), (K, "this is called teamwork"),
 (W, "pushed"), (M, "looking"), (M, "line 88, nil check missing"), (W, "good catch"), (M, "line 140, you're ignoring an error"),
 (W, "on purpose!"), (M, "add a comment saying so"), (W, "fair"), (M, "otherwise lgtm"), (W, "merging"),
]),
(3, "13:40", 90, [
 (T, "lunch crew"), (K, "kebab"), (T, "of course"), (B, "sandwich"), (M, "ramen"), (S, "leftover pasta"), (W, "salad. WITH dressing"),
 (S, "growth"), (W, "i'm a changed wombat"), (T, "i'll have the leftover curry's cousin"), (T, "it's also curry"),
]),
(3, "15:20", 170, [
 (S, "fixed the sort, added a test, pushed"), (T, "tell me about the test"), (S, "it sends two messages in the same second and checks the order"),
 (T, "and?"), (S, "it passed"), (T, "did it fail before the fix"), (S, "...yes"), (T, "good. that's the point of the test"),
 (S, "stop teaching me"), (T, "never"), (M, "can i be added to the learning group"), (T, "it's not a group, it's me nagging"),
 (M, "i'll join the nag"), (K, "i'd like to be nagged too"), (T, "i'm overbooked"), (K, "that's ok, i'll nag myself"),
 (M, "that's the best kind"),
]),
(3, "17:15", 120, [
 (B, "doughnald update: doughnald is huge"), (K, "pic"), (B, "[image: a jar, mostly foam]"), (K, "that's a jar of foam"),
 (B, "that's doughnald"), (M, "is it supposed to be that much foam"), (B, "i don't know! i've never done this!"),
 (W, "you might have fed him too much"), (B, "he's a growing boy"), (T, "you need to discard some"), (B, "discard??? my own child???"),
 (T, "yes, that's how it works"), (B, "this is a dark hobby"), (K, "welcome to bread"),
]),
(3, "20:30", 150, [
 (S, "ok last night of the 4 day stretch, anyone around for a final voice hang"), (K, "yes"), (M, "yes"), (T, "yes"), (W, "yes"),
 (B, "give me five, i'm feeding doughnald"), (S, "of course you are"), (B, "he's eating more than i am"),
 (K, "let's do 9"), (S, "9 works"), (M, "bring snacks"), (T, "you can't bring snacks to voice"), (M, "you can bring snacks in spirit"),
 (T, "...ok that's nice"), (W, "see you all in a bit"),
]),
(3, "23:50", 200, [
 (S, "that was a good one"), (K, "the rake game finale"), (M, "i have never stepped on that many rakes in my life"),
 (B, "you say that every time"), (M, "it's true every time"), (W, "i'm going to bed, work in the morning"),
 (T, "same. gn all"), (K, "night"), (S, "night, thanks everyone"), (B, "gn. doughnald says gn too"),
 (M, "tell doughnald he's a good boy"), (B, "he heard you"),
]),
]

base = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=4)
out, n = [], 0
for day, hm, gap, lines in scenes:
    h, m = map(int, hm.split(":"))
    t = base + timedelta(days=day, hours=h, minutes=m)
    for user, text in lines:
        out.append({"user": user, "text": text, "at": int(t.timestamp())})
        # people reply fast, with the occasional pause
        t += timedelta(seconds=random.randint(4, gap) if random.random() > .12 else random.randint(gap, gap * 4))
        n += 1
out.sort(key=lambda x: x["at"])
for o in out:
    print(json.dumps(o))
