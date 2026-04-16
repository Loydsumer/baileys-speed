"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGroupMetadata = exports.makeGroupsSocket = void 0;
const WAProto_1 = require("../../WAProto");
const Types_1 = require("../Types");
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const chats_1 = require("./chats");

const makeGroupsSocket = (config) => {
    const sock = (0, chats_1.makeChatsSocket)(config);
    const { authState, ev, query, upsertMessage } = sock;

    const groupQuery = async (jid, type, content) => (query({
        tag: 'iq',
        attrs: {
            type,
            xmlns: 'w:g2',
            to: jid,
        },
        content
    }));

    const groupMetadata = async (jid) => {
        const result = await groupQuery(jid, 'get', [{ tag: 'query', attrs: { request: 'interactive' } }]);
        return (0, exports.extractGroupMetadata)(result);
    };

    const groupFetchAllParticipating = async () => {
        const result = await query({
            tag: 'iq',
            attrs: {
                to: '@g.us',
                xmlns: 'w:g2',
                type: 'get',
            },
            content: [
                {
                    tag: 'participating',
                    attrs: {},
                    content: [
                        { tag: 'participants', attrs: {} },
                        { tag: 'description', attrs: {} }
                    ]
                }
            ]
        });

        const data = {};
        const groupsChild = (0, WABinary_1.getBinaryNodeChild)(result, 'groups');

        if (groupsChild) {
            const groups = (0, WABinary_1.getBinaryNodeChildren)(groupsChild, 'group');
            for (const groupNode of groups) {
                const meta = (0, exports.extractGroupMetadata)({
                    tag: 'result',
                    attrs: {},
                    content: [groupNode]
                });
                data[meta.id] = meta;
            }
        }

        sock.ev.emit('groups.update', Object.values(data));
        return data;
    };

    sock.ws.on('CB:ib,,dirty', async (node) => {
        const { attrs } = (0, WABinary_1.getBinaryNodeChild)(node, 'dirty');
        if (attrs.type !== 'groups') return;
        await groupFetchAllParticipating();
        await sock.cleanDirtyBits('groups');
    });

    return {
        ...sock,
        groupQuery,
        groupMetadata,
        groupFetchAllParticipating
    };
};

exports.makeGroupsSocket = makeGroupsSocket;

const extractGroupMetadata = (result) => {
    var _a, _b;

    const group = (0, WABinary_1.getBinaryNodeChild)(result, 'group');
    const descChild = (0, WABinary_1.getBinaryNodeChild)(group, 'description');

    let desc;
    let descId;
    let descOwner;
    let descOwnerLid;
    let descTime;

    if (descChild) {
        desc = (0, WABinary_1.getBinaryNodeChildString)(descChild, 'body');
        descOwner = (0, WABinary_1.jidNormalizedUser)(descChild.attrs.participant_pn || descChild.attrs.participant);

        if (group.attrs.addressing_mode === 'lid') {
            descOwnerLid = (0, WABinary_1.jidNormalizedUser)(descChild.attrs.participant);
        }

        descId = descChild.attrs.id;
        descTime = descChild.attrs.t ? +descChild.attrs.t : undefined;
    }

    const groupSize = group.attrs.size ? Number(group.attrs.size) : undefined;
    const groupId = group.attrs.id.includes('@')
        ? group.attrs.id
        : (0, WABinary_1.jidEncode)(group.attrs.id, 'g.us');

    const memberAddMode =
        (0, WABinary_1.getBinaryNodeChildString)(group, 'member_add_mode') === 'all_member_add';

    const metadata = {
        id: groupId,
        addressingMode: group.attrs.addressing_mode,
        subject: group.attrs.subject,
        subjectOwner: (0, WABinary_1.jidNormalizedUser)(group.attrs.s_o_pn || group.attrs.s_o),

        ...(group.attrs.addressing_mode === 'lid'
            ? { subjectOwnerLid: (0, WABinary_1.jidNormalizedUser)(group.attrs.s_o) }
            : {}),

        subjectTime: group.attrs.s_t ? +group.attrs.s_t : undefined,
        size: groupSize || (0, WABinary_1.getBinaryNodeChildren)(group, 'participant').length,
        creation: group.attrs.creation ? +group.attrs.creation : undefined,
        owner: (0, WABinary_1.jidNormalizedUser)(group.attrs.creator_pn || group.attrs.creator),

        ...(group.attrs.addressing_mode === 'lid'
            ? { ownerLid: (0, WABinary_1.jidNormalizedUser)(group.attrs.creator) }
            : {}),

        desc,
        descId,
        descOwner,
        descOwnerLid,
        descTime,

        linkedParent:
            ((_b = (0, WABinary_1.getBinaryNodeChild)(group, 'linked_parent')) === null || _b === void 0
                ? void 0
                : _b.attrs.jid) || undefined,

        restrict: !!(0, WABinary_1.getBinaryNodeChild)(group, 'locked'),
        announce: !!(0, WABinary_1.getBinaryNodeChild)(group, 'announcement'),
        isCommunity: !!(0, WABinary_1.getBinaryNodeChild)(group, 'parent'),
        isCommunityAnnounce: !!(0, WABinary_1.getBinaryNodeChild)(group, 'default_sub_group'),
        joinApprovalMode: !!(0, WABinary_1.getBinaryNodeChild)(group, 'membership_approval_mode'),

        memberAddMode,

        participants: (0, WABinary_1.getBinaryNodeChildren)(group, 'participant').map(({ attrs }) => ({
            id: attrs.lid || attrs.jid,
            jid: attrs.lid || attrs.phone_number || attrs.jid,
            lid: attrs.lid || attrs.jid,
            admin: (attrs.type || null),
            isAdmin: attrs.type === 'admin' || attrs.type === 'superadmin',
            isSuperAdmin: attrs.type === 'superadmin'
        }))
    };

    return metadata;
};

exports.extractGroupMetadata = extractGroupMetadata;
