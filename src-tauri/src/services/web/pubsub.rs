use std::{collections::HashMap, sync::Arc};

use futures::StreamExt;
use serde::Deserialize;
use tauri::async_runtime::RwLock;
use tokio::sync::mpsc;
use tokio_stream::wrappers::UnboundedReceiverStream;
use warp::{
    filters::BoxedFilter,
    ws::{Message, WebSocket, Ws},
    Filter, Reply,
};

#[derive(Deserialize)]
pub struct PeerQueryData {
    id: String,
}

pub type Peers = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Result<Message, warp::Error>>>>>;

pub fn path(mut input: mpsc::Receiver<String>, output: mpsc::Sender<String>) -> BoxedFilter<(impl Reply,)> {
    let peers = Peers::default();

    let input_peers = peers.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(msg) = input.recv().await {
            let p = input_peers.read().await;
            let str = msg.as_str();
            for peer in p.values() {
                peer.send(Ok(Message::text(str))).ok();
            }
        }
    });

    let peers = warp::any().map(move || peers.clone());
    let output = warp::any().map(move || output.clone());
    let t = warp::path("pubsub")
        .and(super::ws_origin_allowed())
        .and(warp::ws())
        .and(peers)
        .and(output)
        .and(warp::query::<PeerQueryData>())
        .map(|origin_ok: bool, ws: Ws, peers, output, q| {
            if !origin_ok {
                return super::forbidden_origin();
            }
            ws.on_upgrade(move |socket| peer_handler(socket, peers, output, q)).into_response()
        })
        .boxed();
    t
}

pub async fn peer_handler(ws: WebSocket, peers: Peers, output: mpsc::Sender<String>, query: PeerQueryData) {
    let (peer_tx, mut peer_rx) = ws.split();

    let (tx, rx) = mpsc::unbounded_channel();
    let rx = UnboundedReceiverStream::new(rx);
    tauri::async_runtime::spawn(rx.forward(peer_tx));

    {
        // check and insert under one lock, so two clients can't both take the same id
        let mut p = peers.write().await;
        if p.contains_key(&query.id) {
            println!("already registered");
            return;
        }
        p.insert(query.id.clone(), tx);
    }

    while let Some(result) = peer_rx.next().await {
        let Ok(msg) = result else {
            break;
        };
        if msg.is_close() {
            break;
        }
        // ping, pong and binary frames are not messages, keep the connection
        let Ok(msg_str) = msg.to_str() else { continue };
        output.send(msg_str.to_string()).await.ok();
        let p = peers.read().await;
        for (id, peer) in p.iter() {
            if !query.id.eq(id) { // do not send to self
                peer.send(Ok(Message::text(msg_str))).ok();
            }
        }
    }
    peers.write().await.remove(&query.id);
}
